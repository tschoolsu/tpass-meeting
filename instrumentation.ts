// Server 啟動時的 hook：啟動背景任務。
// 只 import nodejs runtime 才能執行的東西，並以動態 import 保持 edge bundle 乾淨。
// 在 `next build`（phase-production-build）時不啟動背景任務，避免建置期間缺少
// runtime env 而炸掉。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startEmailWorker } = await import("./lib/email-worker");
  startEmailWorker();
}
