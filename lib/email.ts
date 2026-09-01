import "server-only";
import { query } from "@/lib/db";
import { authConfig } from "@/config/auth";
import { serviceConfig } from "@/config/service";

export const EMAIL_MAX_ATTEMPTS = 5;
export const RETRY_DELAY_MS = 60_000; // 失敗後 1 分鐘再試

// 建立「發布會議」通知：每個受邀參與人一筆 pending 佇列。
export async function enqueueMeetingNotification(meetingId: number): Promise<void> {
  if (!serviceConfig.smtp) return; // 未設定 SMTP 則略過（靜默不中斷建置）

  const meeting = await query<{ title: string; starts_at: string; location: string; online_link: string }>(
    `SELECT title, starts_at, location, online_link FROM meetings WHERE id = $1`,
    [meetingId],
  );
  const m = meeting.rows[0];
  if (!m) return;

  const meetingUrl = `${authConfig.selfUrl}/read?id=${meetingId}`;
  const subject = `[會議通知] ${m.title}`;
  const lines = [
    `你受邀參加會議「${m.title}」。`,
    ``,
    `時間：${new Date(m.starts_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
    m.location ? `地點：${m.location}` : "",
    m.online_link ? `線上連結：${m.online_link}` : "",
    ``,
    `會議頁面：${meetingUrl}`,
  ];
  const body = lines.filter(Boolean).join("\n");

  const { rows } = await query<{ email: string }>(
    `SELECT email FROM participants WHERE meeting_id = $1`,
    [meetingId],
  );
  if (rows.length === 0) return;

  // H-2：single multi-row INSERT，不再逐筆（500 人就 500 次 RTT）。
  const params: unknown[] = [];
  const tuples = rows
    .map((p, i) => {
      const base = i * 4;
      params.push(meetingId, p.email, subject, body);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, 'pending')`;
    })
    .join(", ");
  await query(
    `INSERT INTO notification_queue (meeting_id, email, subject, body, status)
     VALUES ${tuples}
     ON CONFLICT DO NOTHING`,
    params,
  );
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

  const { rows } = await query<{ id: number; email: string; subject: string; body: string }>(
    `SELECT id, email, subject, body
       FROM notification_queue
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY id
      LIMIT 50`,
  );
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
        await query(
          `UPDATE notification_queue
              SET status = 'sent', sent_at = now(), attempts = attempts + 1
            WHERE id = $1`,
          [row.id],
        );
        sent++;
      } catch {
        await query(
          `UPDATE notification_queue
              SET attempts = attempts + 1,
                  status = CASE WHEN attempts + 1 >= $2 THEN 'failed' ELSE 'pending' END,
                  next_attempt_at = now() + make_interval(secs => $3)
            WHERE id = $1`,
          [row.id, EMAIL_MAX_ATTEMPTS, RETRY_DELAY_MS / 1000],
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SMTP_CONCURRENCY, rows.length) }, worker));
  return { sent };
}

export async function notificationStats(meetingId: number) {
  const { rows } = await query<{ status: string; cnt: number }>(
    `SELECT status, COUNT(*)::int AS cnt
       FROM notification_queue
      WHERE meeting_id = $1
      GROUP BY status`,
    [meetingId],
  );
  return rows;
}

// M-5：清理過期的 sent / failed 佇列紀錄，避免 notification_queue 無限增長。
// 由背景 worker 每日呼叫一次。
export async function purgeNotificationQueue(keepMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const { rowCount } = await query(
    `DELETE FROM notification_queue
      WHERE status IN ('sent', 'failed')
        AND created_at < now() - make_interval(secs => $1)`,
    [keepMs / 1000],
  );
  return rowCount ?? 0;
}
