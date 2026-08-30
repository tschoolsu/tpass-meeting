import "server-only";
import { pool, query } from "@/lib/db";
import type { Motion, MotionWithCount, VoteStatus } from "@/lib/meetings";
import { getMeeting } from "@/lib/meetings";

// 可決門檻的合法值（需求：出席比例 + 同意比例組合）。
export const THRESHOLDS = [
  { label: "出席 1/2＋簡單多數", value: "1/2+1/2" },
  { label: "出席 2/3＋簡單多數", value: "2/3+1/2" },
  { label: "出席 2/3＋同意 2/3", value: "2/3+2/3" },
  { label: "同意 3/4", value: "3/4" },
] as const;

export const VALID_THRESHOLDS: ReadonlySet<string> = new Set(THRESHOLDS.map((t) => t.value));

export interface AgendaInput {
  title: string;
  description: string;
}

// ---- 議程項目 CRUD（需求：會議中尚未表決前可動態新增/修改/刪除） ----

export async function addAgendaItem(meetingId: number, input: AgendaInput): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO agenda_items (meeting_id, position, title, description)
     VALUES ($1, COALESCE((SELECT MAX(position) FROM agenda_items WHERE meeting_id = $1) + 1, 0), $2, $3)
     RETURNING id`,
    [meetingId, input.title.trim(), input.description.trim()],
  );
  return rows[0].id;
}

export async function updateAgendaItem(id: number, input: AgendaInput): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE agenda_items SET title = $2, description = $3 WHERE id = $1`,
    [id, input.title.trim(), input.description.trim()],
  );
  return rowCount > 0;
}

export async function deleteAgendaItem(id: number): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM agenda_items WHERE id = $1`, [id]);
  return rowCount > 0;
}

export async function moveAgendaItem(id: number, dir: "up" | "down", meetingId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const items = await client.query<{ id: number; position: number }>(
      `SELECT id, position FROM agenda_items WHERE meeting_id = $1 ORDER BY position ASC, id ASC`,
      [meetingId],
    );
    const idx = items.rows.findIndex((r) => r.id === id);
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || target < 0 || target >= items.rows.length) {
      await client.query("ROLLBACK");
      return;
    }
    const a = items.rows[idx];
    const b = items.rows[target];
    await client.query(`UPDATE agenda_items SET position = $1 WHERE id = $2`, [a.position, b.id]);
    await client.query(`UPDATE agenda_items SET position = $1 WHERE id = $2`, [b.position, a.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---- 表決案（motion）CRUD ----

export interface MotionInput {
  title: string;
  description: string;
  threshold: string;
}

export async function addMotion(agendaItemId: number, input: MotionInput): Promise<number> {
  if (!VALID_THRESHOLDS.has(input.threshold)) throw new Error("門檻設定不合法");
  const { rows } = await query<{ id: number }>(
    `INSERT INTO motions (agenda_item_id, title, description, threshold, status, position)
     VALUES ($1, $2, $3, $4, '',
             COALESCE((SELECT MAX(position) FROM motions WHERE agenda_item_id = $1) + 1, 0))
     RETURNING id`,
    [agendaItemId, input.title.trim(), input.description.trim(), input.threshold],
  );
  return rows[0].id;
}

// 動態修正：僅在「尚未開始表決」（status 不是 open 或 closed）時允許。
export async function updateMotion(id: number, input: MotionInput): Promise<boolean> {
  const { rows } = await query<{ status: string }>(
    `SELECT status FROM motions WHERE id = $1`,
    [id],
  );
  const motion = rows[0];
  if (!motion) return false;
  if (motion.status === "open" || motion.status === "closed") return false; // 已開始/已結算不可改
  if (!VALID_THRESHOLDS.has(input.threshold)) return false;

  const { rowCount } = await query(
    `UPDATE motions SET title = $2, description = $3, threshold = $4 WHERE id = $1`,
    [id, input.title.trim(), input.description.trim(), input.threshold],
  );
  return rowCount > 0;
}

export async function deleteMotion(id: number): Promise<boolean> {
  const { rows } = await query<{ status: string }>(`SELECT status FROM motions WHERE id = $1`, [id]);
  const motion = rows[0];
  if (!motion) return false;
  if (motion.status === "open" || motion.status === "closed") return false;
  const { rowCount } = await query(`DELETE FROM motions WHERE id = $1`, [id]);
  return rowCount > 0;
}

// ---- 主席控制（需求：推進議程／開始表決／停止並宣告結果） ----

// 開啟表決：把該 motion 設為 open，並同步把同議程其他 motion 關閉。
export async function startVote(motionId: number): Promise<boolean> {
  const { rows } = await query<{ agenda_item_id: number }>(
    `SELECT agenda_item_id FROM motions WHERE id = $1`,
    [motionId],
  );
  if (rows.length === 0) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE motions SET status = 'closed' WHERE agenda_item_id = $1`, [rows[0].agenda_item_id]);
    await client.query(`UPDATE motions SET status = 'open' WHERE id = $1`, [motionId]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// 停止表決並結算。
export async function stopVote(motionId: number): Promise<boolean> {
  const { rowCount } = await query(`UPDATE motions SET status = 'closed' WHERE id = $1 AND status = 'open'`, [motionId]);
  return rowCount > 0;
}

export async function getMotion(motionId: number): Promise<Motion | null> {
  const { rows } = await query<Motion>(
    `SELECT id, agenda_item_id, title, description, threshold, status, position, created_at
       FROM motions WHERE id = $1`,
    [motionId],
  );
  return rows[0] ?? null;
}

export interface MotionFlow {
  meeting: { id: number; title: string; starts_at: string; voting_enabled: boolean };
  motion: MotionWithCount;
  answered: VoteStatus | null;
  isOpen: boolean;
  canStart: boolean; // 會議已開始（時間到）
}

export async function getMotionFlow(motionId: number, email: string): Promise<MotionFlow | null> {
  const motion = await getMotion(motionId);
  if (!motion) return null;

  const meetingId = await getMeetingOfAgenda(motion.agenda_item_id);
  if (!meetingId) return null;
  const meeting = await getMeeting(meetingId);
  if (!meeting) return null;

  const [counts, mine] = await Promise.all([
    query<{ vote_status: string; cnt: number }>(
      `SELECT vote_status, COUNT(*)::int AS cnt FROM ballots WHERE motion_id = $1 GROUP BY vote_status`,
      [motion.id],
    ),
    query<{ vote_status: string }>(
      `SELECT vote_status FROM ballots WHERE motion_id = $1 AND voter_email = $2`,
      [motion.id, email],
    ),
  ]);

  const c = (s: VoteStatus) => counts.rows.find((r) => r.vote_status === s)?.cnt ?? 0;

  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      starts_at: meeting.starts_at,
      voting_enabled: meeting.voting_enabled,
    },
    motion: {
      ...motion,
      agree: c("agree"),
      against: c("against"),
      abstain: c("abstain"),
    },
    answered: mine.rows[0]?.vote_status as VoteStatus | null ?? null,
    isOpen: motion.status === "open",
    canStart: new Date(meeting.starts_at).getTime() <= Date.now(),
  };
}

async function getMeetingOfAgenda(agendaItemId: number): Promise<number> {
  const { rows } = await query<{ meeting_id: number }>(
    `SELECT meeting_id FROM agenda_items WHERE id = $1`,
    [agendaItemId],
  );
  return rows[0]?.meeting_id ?? 0;
}

export async function submitBallot(motionId: number, voterEmail: string, status: VoteStatus): Promise<"ok" | "duplicate" | "not-open"> {
  const motion = await getMotion(motionId);
  if (!motion) return "not-open";
  if (motion.status !== "open") return "not-open"; // 未開始表決禁止投票（需求）
  const { rowCount } = await query(
    `INSERT INTO ballots (motion_id, voter_email, vote_status)
     VALUES ($1, $2, $3)
     ON CONFLICT (motion_id, voter_email) DO NOTHING`,
    [motionId, voterEmail, status],
  );
  return rowCount > 0 ? "ok" : "duplicate";
}

// ---- 附件（需求：議程附件空間） ----

export async function addAttachment(
  agendaItemId: number,
  info: { filename: string; mime: string; size: number; storage_path: string },
): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO agenda_attachments (agenda_item_id, filename, mime, size, storage_path)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [agendaItemId, info.filename, info.mime, info.size, info.storage_path],
  );
  return rows[0].id;
}

export async function getAttachment(id: number): Promise<{ filename: string; mime: string; storage_path: string } | null> {
  const { rows } = await query<{ filename: string; mime: string; storage_path: string }>(
    `SELECT filename, mime, storage_path FROM agenda_attachments WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// 具名表決統計（需求：公開透明 + 會議紀錄匯出）。回傳每種狀態的票數與全員名單。
export async function getMotionResults(motionId: number): Promise<{
  motion_id: number;
  title: string;
  threshold: string;
  status: string;
  agree: number;
  against: number;
  abstain: number;
  total: number;
  not_voted: number;
  ballots: { voter_email: string; vote_status: VoteStatus }[];
} | null> {
  const motion = await getMotion(motionId);
  if (!motion) return null;

  const [bRows, pRows] = await Promise.all([
    query<{ voter_email: string; vote_status: VoteStatus }>(
      `SELECT voter_email, vote_status FROM ballots WHERE motion_id = $1 ORDER BY voter_email`,
      [motionId],
    ),
    query<{ email: string }>(
      `SELECT p.email
         FROM participants p
         JOIN agenda_items ai ON ai.meeting_id = p.meeting_id
         JOIN motions m2 ON m2.agenda_item_id = ai.id
        WHERE m2.id = $1
        ORDER BY p.email`,
      [motionId],
    ),
  ]);

  const ballots = bRows.rows;
  const votedEmails = new Set(ballots.map((b) => b.voter_email));
  const notVoted = pRows.rows.filter((p) => !votedEmails.has(p.email)).map((p) => p.email);
  const count = (s: VoteStatus) => ballots.filter((b) => b.vote_status === s).length;

  return {
    motion_id: motion.id,
    title: motion.title,
    threshold: motion.threshold,
    status: motion.status,
    agree: count("agree"),
    against: count("against"),
    abstain: count("abstain"),
    total: ballots.length,
    not_voted: notVoted.length,
    ballots,
  };
}

// 整個會議的具名投票矩陣（需求 4：所有使用者皆可即時與事後查看）。
// 回傳每人（應出席學生）對每個表決案的投票狀態（含未投票）。
export interface MeetingBallotMatrix {
  meeting_id: number;
  participants: { email: string; grade: string }[];
  motions: { id: number; title: string; threshold: string; status: string; position: number }[];
  votes: Record<string, Record<string, VoteStatus>>; // participantEmail -> motionId -> status
  counts: Record<number, { agree: number; against: number; abstain: number }>;
}

export async function getMeetingBallots(meetingId: number): Promise<MeetingBallotMatrix | null> {
  const [pRows, mRows, bRows] = await Promise.all([
    query<{ email: string; grade: string }>(
      `SELECT email, grade FROM participants WHERE meeting_id = $1 ORDER BY email`,
      [meetingId],
    ),
    query<{ id: number; title: string; threshold: string; status: string; position: number }>(
      `SELECT m.id, m.title, m.threshold, m.status, m.position
         FROM motions m
         JOIN agenda_items ai ON ai.id = m.agenda_item_id
        WHERE ai.meeting_id = $1
        ORDER BY ai.position, m.position`,
      [meetingId],
    ),
    query<{ motion_id: number; voter_email: string; vote_status: VoteStatus }>(
      `SELECT b.motion_id, b.voter_email, b.vote_status
         FROM ballots b
         JOIN motions m ON m.id = b.motion_id
         JOIN agenda_items ai ON ai.id = m.agenda_item_id
        WHERE ai.meeting_id = $1`,
      [meetingId],
    ),
  ]);

  const votes: MeetingBallotMatrix["votes"] = {};
  const counts: MeetingBallotMatrix["counts"] = {};
  for (const m of mRows.rows) counts[m.id] = { agree: 0, against: 0, abstain: 0 };

  for (const b of bRows.rows) {
    if (!votes[b.voter_email]) votes[b.voter_email] = {};
    votes[b.voter_email][String(b.motion_id)] = b.vote_status;
    const c = counts[b.motion_id];
    if (c) c[b.vote_status] += 1;
  }

  return {
    meeting_id: meetingId,
    participants: pRows.rows,
    motions: mRows.rows,
    votes,
    counts,
  };
}
