// 資料庫存取層：Prisma 7 + @prisma/adapter-pg。schema 在 prisma/schema.prisma，
// 變更一律 `pnpm exec prisma migrate dev`——啟動時不跑任何 DDL／資料遷移。
//
// 2026-09-02 事故：以前這裡在每次 process 啟動時把整包 CREATE TABLE IF NOT EXISTS／ALTER TABLE
// 當一個交易跑，對所有表拿排他鎖，跟正在跑的查詢撞出 deadlock；pg Pool 沒掛 error handler，
// PostgreSQL 一重啟就滿版 uncaughtException。準則見 tpass-ops handbook〈資料庫〉。
import "server-only";
import { Client } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { serviceConfig } from "@/config/service";

// Prisma 7 的連線池就是 pg 的 Pool，預設沒有任何逾時。這裡明確給上限：
// 依賴變慢時 request 會失敗而不是無限排隊把整台服務拖垮。
// max 25：開會時多人同時簽到／投票／看投屏，併發比其他服務高（樣板是 10）。
const adapter = new PrismaPg({
  connectionString: serviceConfig.postgresUrl,
  max: 25,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  options: "-c statement_timeout=30000",
});

// 單例掛在 globalThis，而且不分 dev／prod：Next 會把 RSC／server action 與 route handler
// 編進不同 layer，各自載入一份本模組；不掛 globalThis 就會有好幾個 25 條的池，
// 而且 instrumentation.ts 關機時 $disconnect() 的會是它自己那份、不是在服務 request 的那份。
const g = globalThis as unknown as {
  __tpmPrisma?: PrismaClient;
  __tpmListenClient?: Client | null;
};

export const prisma: PrismaClient =
  g.__tpmPrisma ??
  (g.__tpmPrisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  }));

// ---- LISTEN 專用的獨立連線（只給 lib/stream.ts 用） ----
//
// 準則第 5 條：需要 LISTEN/NOTIFY 才准另開「一條」獨立 pg client，且只做 LISTEN；
// 資料存取一律走 Prisma，NOTIFY 用 prisma.$executeRaw。這條連線不進 Prisma 的池，
// 因為 LISTEN 要長期佇著一條連線，放進池裡會少一條給查詢用、也會被 idleTimeout 收走。

// 建立並連上一條新的 LISTEN client。一定掛 error handler：沒掛的話 PostgreSQL 重啟時
// socket 錯誤會變成 uncaughtException 把整個 process 打掉。
export async function listenClient(): Promise<Client> {
  const client = new Client({ connectionString: serviceConfig.postgresUrl });
  client.on("error", (err) => {
    // 斷線的善後（重連）在 lib/stream.ts 的 relay 迴圈；這裡只負責不讓它變 uncaught。
    console.error("[db] LISTEN 連線錯誤", err.message);
  });
  await client.connect();
  g.__tpmListenClient = client;
  return client;
}

// 關機用：結束目前的 LISTEN 連線。relay 迴圈收到 end 事件後會因 stopping 旗標而不再重連。
export async function stopListen(): Promise<void> {
  const client = g.__tpmListenClient;
  g.__tpmListenClient = null;
  if (!client) return;
  try {
    await client.end();
  } catch {
    /* 已經斷了就算了 */
  }
}
