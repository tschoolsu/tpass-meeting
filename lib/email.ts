import "server-only";
import { prisma } from "@/lib/db";
import { authConfig } from "@/config/auth";
import { serviceConfig } from "@/config/service";

export const EMAIL_MAX_ATTEMPTS = 5;
export const RETRY_DELAY_MS = 60_000; // 失敗後 1 分鐘再試

// 建立「發布會議」通知：每個受邀參與人一筆 pending 佇列。
export async function enqueueMeetingNotification(meetingId: number): Promise<void> {
  if (!serviceConfig.smtp) return; // 未設定 SMTP 則略過（靜默不中斷建置）

  const m = await prisma.meetings.findUnique({
    where: { id: meetingId },
    select: { title: true, starts_at: true, location: true, online_link: true },
  });
  if (!m) return;

  const meetingUrl = `${authConfig.selfUrl}/read?id=${meetingId}`;
  const subject = `[會議通知] ${m.title}`;
  const lines = [
    `你受邀參加會議「${m.title}」。`,
    ``,
    `時間：${m.starts_at.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
    m.location ? `地點：${m.location}` : "",
    m.online_link ? `線上連結：${m.online_link}` : "",
    ``,
    `會議頁面：${meetingUrl}`,
  ];
  const body = lines.filter(Boolean).join("\n");

  const rows = await prisma.participants.findMany({ where: { meeting_id: meetingId }, select: { email: true } });
  if (rows.length === 0) return;

  // H-2：一次 multi-row INSERT，不再逐筆（500 人就 500 次 RTT）。
  // LOGIC-001：UNIQUE(meeting_id, email) + skipDuplicates，重複發布不會重複寄。
  await prisma.notification_queue.createMany({
    data: rows.map((p) => ({ meeting_id: meetingId, email: p.email, subject, body, status: "pending" })),
    skipDuplicates: true,
  });
}

// SMTP 派送併發上限：避免一次把 SMTP server 打爆，也不會逐封串列等。
const SMTP_CONCURRENCY = 5;

// 派送所有「待寄且已到重試時間」的郵件。供發布與背景 worker 呼叫。
export async function dispatchPendingEmails(): Promise<{ sent: number }> {
  const smtp = serviceConfig.smtp;
  if (!smtp) return { sent: 0 };

  const { host, port, secure, user, pass, from } = smtp;

  const nodemailer = await import("nodemailer").catch(() => null);
  if (!nodemailer) return { sent: 0 }; // nodemailer 未安裝則略過

  const rows = await prisma.notification_queue.findMany({
    where: { status: "pending", next_attempt_at: { lte: new Date() } },
    select: { id: true, email: true, subject: true, body: true, attempts: true },
    orderBy: { id: "asc" },
    take: 50,
  });
  if (rows.length === 0) return { sent: 0 };

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // H-1：SMTP 不回應也要有明確上限，不要讓派送卡在無窮等待。
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  let sent = 0;
  let idx = 0;
  async function worker() {
    while (idx < rows.length) {
      const row = rows[idx++];
      try {
        await transporter.sendMail({
          from,
          to: row.email,
          subject: row.subject,
          text: row.body,
        });
        await prisma.notification_queue.update({
          where: { id: row.id },
          data: { status: "sent", sent_at: new Date(), attempts: { increment: 1 } },
        });
        sent++;
      } catch {
        // 第 N 次失敗就標 failed；否則 1 分鐘後再試。attempts 以剛讀到的值算（同一時間只有這個 worker 在動這列）。
        const attempts = row.attempts + 1;
        await prisma.notification_queue.update({
          where: { id: row.id },
          data: {
            attempts,
            status: attempts >= EMAIL_MAX_ATTEMPTS ? "failed" : "pending",
            next_attempt_at: new Date(Date.now() + RETRY_DELAY_MS),
          },
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SMTP_CONCURRENCY, rows.length) }, worker));
  return { sent };
}

export async function notificationStats(meetingId: number): Promise<{ status: string; cnt: number }[]> {
  const rows = await prisma.notification_queue.groupBy({
    by: ["status"],
    where: { meeting_id: meetingId },
    _count: { _all: true },
  });
  return rows.map((r) => ({ status: r.status, cnt: r._count._all }));
}

// M-5：清理過期的 sent / failed 佇列紀錄，避免 notification_queue 無限增長。
// 由背景 worker 每日呼叫一次。
export async function purgeNotificationQueue(keepMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const { count } = await prisma.notification_queue.deleteMany({
    where: { status: { in: ["sent", "failed"] }, created_at: { lt: new Date(Date.now() - keepMs) } },
  });
  return count;
}
