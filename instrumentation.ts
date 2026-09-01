// Server 啟動時的 hook：啟動背景任務。
// 只 import nodejs runtime 才能執行的東西，並以動態 import 保持 edge bundle 乾淨。
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEmailWorker } = await import("./lib/email-worker");
    startEmailWorker();
  }
}
