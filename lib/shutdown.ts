// 關機處理（由 instrumentation.ts 在 nodejs runtime 啟動時登記）。
//
// Next 收到 SIGINT/SIGTERM 會等 server.close() 收完所有連線再退出，但 SSE 在 prod 永遠不會自己結束、
// LISTEN 連線也一直佇著 → 每次 pm2 reload 都等到逾時被 SIGKILL，進行中的查詢直接斷。
// 這裡主動把三樣東西收掉：所有 SSE → LISTEN 連線 → Prisma 連線池，然後讓 Next 自己收尾（不 process.exit）。
import "server-only";
import { prisma, stopListen } from "@/lib/db";
import { closeAllStreams } from "@/lib/stream";

let registered = false;

export function registerShutdown(): void {
  if (registered) return;
  registered = true;

  const shutdown = async (signal: NodeJS.Signals) => {
    try {
      const n = closeAllStreams();
      if (n > 0) console.log(`[shutdown] ${signal}：已關閉 ${n} 條 SSE`);
    } catch (err) {
      console.error("[shutdown] 關閉 SSE 失敗", err);
    }
    try {
      await stopListen();
    } catch (err) {
      console.error("[shutdown] 關閉 LISTEN 連線失敗", err);
    }
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error("[shutdown] 關閉資料庫連線池失敗", err);
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
