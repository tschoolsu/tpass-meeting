// Server 啟動時的 hook：啟動背景任務、登記關機處理。
// 只 import nodejs runtime 才能執行的東西，並以動態 import 保持 edge bundle 乾淨。
// 在 `next build`（phase-production-build）時不啟動背景任務，避免建置期間缺少
// runtime env 而炸掉。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startEmailWorker } = await import("./lib/email-worker");
  startEmailWorker();

  // SIGINT/SIGTERM：主動關 SSE、LISTEN、連線池，讓 pm2 reload 不再等到 SIGKILL（見 lib/shutdown.ts）。
  const { registerShutdown } = await import("./lib/shutdown");
  registerShutdown();
}
