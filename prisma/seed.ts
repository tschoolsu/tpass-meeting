// 部會清單的一次性種子：env DEPARTMENTS（逗號分隔）→ departments 表，**只在表是空的時候**灌。
// 之後以 DB 為準（/panel 管），管理員刪掉的部會不會因為 env 還列著而復活。
//
//   pnpm db:seed
//
// 以前這段在 lib/db.ts 的啟動流程裡；2026-09-02 起啟動時不准碰資料（準則見 tpass-ops handbook〈資料庫〉）。
// 主機上的 departments 早就有資料，這支基本上只給全新的本機庫用。
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// 腳本不經 Next，process.env 不會自動載入 .env.local；用跟 prisma.config.ts 同一套順序讀。
config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.POSTGRES_URL;
if (!url) throw new Error("[seed] 缺少 POSTGRES_URL（請檢查 .env.local）");

const departments = (process.env.DEPARTMENTS ?? "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });

async function main() {
  if (departments.length === 0) {
    console.log("[seed] env DEPARTMENTS 是空的，沒東西可灌");
    return;
  }
  const existing = await prisma.departments.count();
  if (existing > 0) {
    console.log(`[seed] departments 已有 ${existing} 筆，略過（表非空不灌）`);
    return;
  }
  const { count } = await prisma.departments.createMany({
    data: departments.map((name, i) => ({ name, position: i + 1 })),
    skipDuplicates: true,
  });
  console.log(`[seed] 灌入 ${count} 個部會`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
