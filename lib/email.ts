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
  for (const p of rows) {
    await query(
      `INSERT INTO notification_queue (meeting_id, email, subject, body, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT DO NOTHING`,
      [meetingId, p.email, subject, body],
    );
  }
}

// 派送所有「待寄且已到重試時間」的郵件。供發布與手動/背景 task 呼叫。
export async function dispatchPendingEmails(): Promise<{ sent: number }> {
  const smtp = serviceConfig.smtp;
  if (!smtp) return { sent: 0 };

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
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  let sent = 0;
  for (const row of rows) {
    try {
      await transporter.sendMail({
        from: smtp.from,
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
