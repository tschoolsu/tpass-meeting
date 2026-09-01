import "server-only";

// H-2：Email 派送背景 worker。由 instrumentation.ts 在 server 啟動時啟動，
// 每 30 秒掃一次「待寄且已到重試時間」的佇列。
// 這樣「發布會議」的 server action 只負責 enqueue，不再同步卡在 SMTP 上數分鐘。
let started = false;

export function startEmailWorker(intervalMs = 30_000): void {
  if (started) return;
  started = true;

  const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 每日清理一次過期佇列
  let lastPurgeAt = 0;

  const run = async () => {
    try {
      const { dispatchPendingEmails, purgeNotificationQueue } = await import("@/lib/email");
      const { sent } = await dispatchPendingEmails();
      if (sent > 0) {
        console.log(`[email-worker] 已派送 ${sent} 封通知`);
      }
      // M-5：每日清理過期 sent/failed，避免佇列無限增長。
      if (Date.now() - lastPurgeAt >= PURGE_INTERVAL_MS) {
        lastPurgeAt = Date.now();
        const purged = await purgeNotificationQueue();
        if (purged > 0) {
          console.log(`[email-worker] 已清理 ${purged} 筆過期通知`);
        }
      }
    } catch (err) {
      console.error("[email-worker] 派送失敗，下次重試", err);
    }
  };

  // 立即跑一次（啟動時消化累積的佇列），之後固定間隔。
  void run();
  const timer = setInterval(run, intervalMs);
  // 不讓定時器擋住 process 正常退出（pm2/測試環境）。
  timer.unref?.();
}
