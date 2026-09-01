import "server-only";
import type { PoolClient } from "pg";
import { pool, query } from "@/lib/db";
import type { Motion, MotionWithCount, VoteStatus } from "@/lib/meetings";
import { getMeeting, motionCols, removeAttachmentFiles } from "@/lib/meetings";
import { fillNames } from "@/lib/name-map";
import { evaluateMotion, motionOutcome, type MotionEvaluation, type MotionOutcome } from "@/lib/threshold";

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

export async function updateAgendaItem(meetingId: number, id: number, input: AgendaInput): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE agenda_items SET title = $3, description = $4 WHERE id = $2 AND meeting_id = $1`,
    [meetingId, id, input.title.trim(), input.description.trim()],
  );
  return rowCount > 0;
}

export async function deleteAgendaItem(meetingId: number, id: number): Promise<boolean> {
  const { rows: files } = await query<{ storage_path: string }>(
    `SELECT a.storage_path FROM agenda_attachments a
       JOIN agenda_items ai ON ai.id = a.agenda_item_id
      WHERE a.agenda_item_id = $2 AND ai.meeting_id = $1`,
    [meetingId, id],
  );
  const { rowCount } = await query(`DELETE FROM agenda_items WHERE id = $2 AND meeting_id = $1`, [meetingId, id]);
  if (rowCount > 0) await removeAttachmentFiles(files.map((f) => f.storage_path));
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

// 僅在該議程屬於指定會議（meetingId）時才允許新增，回傳 0 代表議程不存在或未授權。
export async function addMotion(meetingId: number, agendaItemId: number, input: MotionInput): Promise<number> {
  if (!VALID_THRESHOLDS.has(input.threshold)) throw new Error("門檻設定不合法");
  const { rows } = await query<{ id: number }>(
    `INSERT INTO motions (agenda_item_id, title, description, threshold, status, position)
     SELECT id, $2, $3, $4, '',
            COALESCE((SELECT MAX(position) FROM motions WHERE agenda_item_id = a.id) + 1, 0)
       FROM agenda_items a
      WHERE a.id = $1 AND a.meeting_id = $5
     RETURNING id`,
    [agendaItemId, input.title.trim(), input.description.trim(), input.threshold, meetingId],
  );
  return rows[0]?.id ?? 0;
}

// 動態修正：僅在「尚未開始表決」（status 不是 open 或 closed）且屬於指定會議時允許。
export async function updateMotion(meetingId: number, id: number, input: MotionInput): Promise<boolean> {
  const { rows } = await query<{ status: string }>(
    `SELECT status FROM motions
      WHERE id = $1 AND agenda_item_id IN (SELECT id FROM agenda_items WHERE meeting_id = $2)`,
    [id, meetingId],
  );
  const motion = rows[0];
  if (!motion) return false;
  if (motion.status === "open" || motion.status === "closed") return false; // 已開始/已結算不可改
  if (!VALID_THRESHOLDS.has(input.threshold)) return false;

  const { rowCount } = await query(
    `UPDATE motions SET title = $3, description = $4, threshold = $5
      WHERE id = $1 AND agenda_item_id IN (SELECT id FROM agenda_items WHERE meeting_id = $2)`,
    [id, meetingId, input.title.trim(), input.description.trim(), input.threshold],
  );
  return rowCount > 0;
}

export async function deleteMotion(meetingId: number, id: number): Promise<boolean> {
  const { rows } = await query<{ status: string }>(
    `SELECT status FROM motions
      WHERE id = $1 AND agenda_item_id IN (SELECT id FROM agenda_items WHERE meeting_id = $2)`,
    [id, meetingId],
  );
  const motion = rows[0];
  if (!motion) return false;
  if (motion.status === "open" || motion.status === "closed") return false;
  const { rowCount } = await query(
    `DELETE FROM motions
      WHERE id = $1 AND agenda_item_id IN (SELECT id FROM agenda_items WHERE meeting_id = $2)`,
    [id, meetingId],
  );
  return rowCount > 0;
}

// ---- 主席控制（需求：推進議程／開始表決／停止並宣告結果） ----

// 指定某議程項目為「現行」；僅允許指向該會議自己的議程項目。null ＝ 回到簽到階段。
export async function setCurrentAgendaItem(meetingId: number, agendaItemId: number | null): Promise<boolean> {
  if (agendaItemId === null) {
    const { rowCount } = await query(`UPDATE meetings SET current_agenda_item_id = NULL WHERE id = $1`, [meetingId]);
    return rowCount > 0;
  }
  const { rowCount } = await query(
    `UPDATE meetings
        SET current_agenda_item_id = (SELECT id FROM agenda_items WHERE id = $1 AND meeting_id = $2)
      WHERE id = $2
        AND EXISTS (SELECT 1 FROM agenda_items WHERE id = $1 AND meeting_id = $2)`,
    [agendaItemId, meetingId],
  );
  return rowCount > 0;
}

// 把現行議程往前／往後移一筆；到頭時回傳 false（不循環）。沒設現行時「下一案」從第一筆開始。
async function stepAgendaItem(meetingId: number, dir: 1 | -1): Promise<boolean> {
  const { rows } = await query<{ id: number; position: number }>(
    `SELECT id, position FROM agenda_items WHERE meeting_id = $1 ORDER BY position ASC, id ASC`,
    [meetingId],
  );
  if (rows.length === 0) return false;
  const { rows: m } = await query<{ current_agenda_item_id: number | null }>(
    `SELECT current_agenda_item_id FROM meetings WHERE id = $1`,
    [meetingId],
  );
  const currentId = m[0]?.current_agenda_item_id ?? null;
  const idx = rows.findIndex((r) => r.id === currentId);
  // idx = -1 就是簽到階段：下一案進議程 1；從議程 1 按上一案回到簽到（target = -1）。
  const target = idx < 0 ? (dir === 1 ? 0 : -2) : idx + dir;
  if (target < -1 || target >= rows.length) return false;
  await query(`UPDATE meetings SET current_agenda_item_id = $1 WHERE id = $2`, [target < 0 ? null : rows[target].id, meetingId]);
  return true;
}

export const nextAgendaItem = (meetingId: number) => stepAgendaItem(meetingId, 1);
export const prevAgendaItem = (meetingId: number) => stepAgendaItem(meetingId, -1);

// 結算一案（同一 transaction 內）：鎖列、以「當下」的已簽到／應到與票數判定，寫回快照。
// 只結算屬於 meetingId 且 open 的案（SEC-002）；否則回 null。
async function settleMotion(client: PoolClient, meetingId: number, motionId: number): Promise<MotionEvaluation | null> {
  const { rows } = await client.query<{ threshold: string; status: string; meeting_id: number }>(
    `SELECT m.threshold, m.status, ai.meeting_id
       FROM motions m JOIN agenda_items ai ON ai.id = m.agenda_item_id
      WHERE m.id = $1 AND ai.meeting_id = $2 FOR UPDATE OF m`,
    [motionId, meetingId],
  );
  const m = rows[0];
  if (!m || m.status !== "open") return null;

  const { rows: p } = await client.query<{ expected: number; present: number }>(
    `SELECT COUNT(*)::int AS expected, COUNT(*) FILTER (WHERE checked_in)::int AS present
       FROM participants WHERE meeting_id = $1`,
    [m.meeting_id],
  );
  const { rows: b } = await client.query<{ agree: number; against: number }>(
    `SELECT COUNT(*) FILTER (WHERE vote_status = 'agree')::int AS agree,
            COUNT(*) FILTER (WHERE vote_status = 'against')::int AS against
       FROM ballots WHERE motion_id = $1`,
    [motionId],
  );
  const tally = { threshold: m.threshold, agree: b[0].agree, against: b[0].against, present: p[0].present, expected: p[0].expected };
  const ev = evaluateMotion(tally);
  await client.query(
    `UPDATE motions
        SET status = 'closed', closed_at = now(), present_count = $2, expected_count = $3, result = $4
      WHERE id = $1`,
    [motionId, tally.present, tally.expected, ev.result],
  );
  return ev;
}

// 開啟表決：同會議其他進行中的案先結算（全站假設同時只有一個 open 案），再把這案設為 open。
// 已結算的案不能重開（結果已定），回 "already-closed"。只動屬於 meetingId 的案（SEC-002）。
export async function startVote(meetingId: number, motionId: number): Promise<"ok" | "not-found" | "already-closed"> {
  const { rows } = await query<{ status: string; meeting_id: number }>(
    `SELECT m.status, ai.meeting_id FROM motions m JOIN agenda_items ai ON ai.id = m.agenda_item_id
      WHERE m.id = $1 AND ai.meeting_id = $2`,
    [motionId, meetingId],
  );
  const target = rows[0];
  if (!target) return "not-found";
  if (target.status === "closed") return "already-closed";
  if (target.status === "open") return "ok";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: open } = await client.query<{ id: number }>(
      `SELECT m.id FROM motions m JOIN agenda_items ai ON ai.id = m.agenda_item_id
        WHERE ai.meeting_id = $1 AND m.status = 'open'`,
      [target.meeting_id],
    );
    for (const o of open) await settleMotion(client, target.meeting_id, o.id);
    await client.query(`UPDATE motions SET status = 'open', opened_at = now() WHERE id = $1 AND status = ''`, [motionId]);
    await client.query("COMMIT");
    return "ok";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// 停止表決並結算（寫入出席快照與結果）；只動屬於 meetingId 的案。不是 open 回 null。
export async function stopVote(meetingId: number, motionId: number): Promise<MotionEvaluation | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ev = await settleMotion(client, meetingId, motionId);
    await client.query("COMMIT");
    return ev;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getMotion(motionId: number): Promise<Motion | null> {
  const { rows } = await query<Motion>(`SELECT ${motionCols} FROM motions WHERE id = $1`, [motionId]);
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
    },
    answered: mine.rows[0]?.vote_status as VoteStatus | null ?? null,
    isOpen: motion.status === "open",
    canStart: new Date(meeting.starts_at).getTime() <= Date.now(),
  };
}

// 我在這場會議投過的表決案 id（快照的 me.voted_motion_ids；彈窗靠它判斷「還沒投」）。
export async function listMyVotedMotionIds(meetingId: number, email: string): Promise<number[]> {
  const { rows } = await query<{ motion_id: number }>(
    `SELECT b.motion_id
       FROM ballots b
       JOIN motions m ON m.id = b.motion_id
       JOIN agenda_items ai ON ai.id = m.agenda_item_id
      WHERE ai.meeting_id = $1 AND b.voter_email = LOWER($2)`,
    [meetingId, email],
  );
  return rows.map((r) => r.motion_id);
}

async function getMeetingOfAgenda(agendaItemId: number): Promise<number> {
  const { rows } = await query<{ meeting_id: number }>(
    `SELECT meeting_id FROM agenda_items WHERE id = $1`,
    [agendaItemId],
  );
  return rows[0]?.meeting_id ?? 0;
}

export async function submitBallot(
  motionId: number,
  voter: { email: string; name: string },
  status: VoteStatus,
): Promise<"ok" | "duplicate" | "not-open" | "invalid"> {
  // ERR-002：防禦性校驗，避免非法投票選項觸發 DB CHECK 例外。
  if (status !== "agree" && status !== "against") return "invalid";
  const motion = await getMotion(motionId);
  if (!motion) return "not-open";
  if (motion.status !== "open") return "not-open"; // 未開始表決禁止投票（需求）
  const { rowCount } = await query(
    `INSERT INTO ballots (motion_id, voter_email, voter_name, vote_status)
     VALUES ($1, LOWER($2), $3, $4)
     ON CONFLICT (motion_id, voter_email) DO NOTHING`,
    [motionId, voter.email, voter.name.trim(), status],
  );
  return rowCount > 0 ? "ok" : "duplicate";
}

// ---- 附件（需求：議程附件空間） ----

// 僅在該議程屬於指定會議（meetingId）時才允許新增附件；回傳 0 代表未授權。
export async function addAttachment(
  meetingId: number,
  agendaItemId: number,
  info: { filename: string; mime: string; size: number; storage_path: string },
): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO agenda_attachments (agenda_item_id, filename, mime, size, storage_path)
     SELECT id, $2, $3, $4, $5
       FROM agenda_items a
      WHERE a.id = $1 AND a.meeting_id = $6
     RETURNING id`,
    [agendaItemId, info.filename, info.mime, info.size, info.storage_path, meetingId],
  );
  return rows[0]?.id ?? 0;
}

export async function getAttachment(id: number): Promise<{ meeting_id: number; filename: string; mime: string; storage_path: string } | null> {
  const { rows } = await query<{ meeting_id: number; filename: string; mime: string; storage_path: string }>(
    `SELECT ai.meeting_id, a.filename, a.mime, a.storage_path
       FROM agenda_attachments a
       JOIN agenda_items ai ON ai.id = a.agenda_item_id
      WHERE a.id = $1`,
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
  total: number;
  not_voted: number;
  present_count: number | null;
  expected_count: number | null;
  result: Motion["result"];
  /** 通過判定（open 用即時出席數，closed 用結算快照）；尚未開放為 null。 */
  outcome: MotionOutcome | null;
  ballots: { voter_email: string; voter_name: string; vote_status: VoteStatus }[];
} | null> {
  const motion = await getMotion(motionId);
  if (!motion) return null;

  const [bRows, pRows] = await Promise.all([
    query<{ voter_email: string; voter_name: string; vote_status: VoteStatus }>(
      `SELECT b.voter_email,
              COALESCE(NULLIF(b.voter_name, ''), NULLIF(p.name, ''), '') AS voter_name,
              b.vote_status
         FROM ballots b
         JOIN motions m ON m.id = b.motion_id
         JOIN agenda_items ai ON ai.id = m.agenda_item_id
         LEFT JOIN participants p ON p.meeting_id = ai.meeting_id AND p.email = b.voter_email
        WHERE b.motion_id = $1
        ORDER BY voter_name, b.voter_email`,
      [motionId],
    ),
    query<{ email: string; checked_in: boolean }>(
      `SELECT p.email, p.checked_in
         FROM participants p
         JOIN agenda_items ai ON ai.meeting_id = p.meeting_id
         JOIN motions m2 ON m2.agenda_item_id = ai.id
        WHERE m2.id = $1
        ORDER BY p.email`,
      [motionId],
    ),
  ]);

  // voter_name 已在 SQL 用 participants.name 補過；還是空的再用 name-map.csv 補
  const ballots = (
    await fillNames(bRows.rows.map((b) => ({ email: b.voter_email, name: b.voter_name, vote_status: b.vote_status })))
  ).map((b) => ({ voter_email: b.email, voter_name: b.name, vote_status: b.vote_status }));
  const votedEmails = new Set(ballots.map((b) => b.voter_email));
  const notVoted = pRows.rows.filter((p) => !votedEmails.has(p.email)).map((p) => p.email);
  const count = (s: VoteStatus) => ballots.filter((b) => b.vote_status === s).length;
  const agree = count("agree");
  const against = count("against");
  const live = { present: pRows.rows.filter((p) => p.checked_in).length, expected: pRows.rows.length };

  return {
    motion_id: motion.id,
    title: motion.title,
    threshold: motion.threshold,
    status: motion.status,
    agree,
    against,
    total: ballots.length,
    not_voted: notVoted.length,
    present_count: motion.present_count,
    expected_count: motion.expected_count,
    result: motion.result,
    outcome: motionOutcome({ ...motion, agree, against }, live),
    ballots,
  };
}

// 整個會議的具名投票矩陣（需求 4：所有使用者皆可即時與事後查看）。
// 回傳每人（應出席學生）對每個表決案的投票狀態（含未投票）。
export interface MeetingBallotMatrix {
  meeting_id: number;
  participants: { email: string; name: string; grade: string; checked_in: boolean }[];
  motions: {
    id: number;
    title: string;
    threshold: string;
    status: string;
    position: number;
    agenda_title: string;
    agenda_position: number;
    present_count: number | null;
    expected_count: number | null;
    result: Motion["result"];
  }[];
  votes: Record<string, Record<string, VoteStatus>>; // participantEmail -> motionId -> status
  counts: Record<number, { agree: number; against: number }>;
}

export async function getMeetingBallots(meetingId: number): Promise<MeetingBallotMatrix | null> {
  const [pRows, mRows, bRows] = await Promise.all([
    query<{ email: string; name: string; grade: string; checked_in: boolean }>(
      `SELECT email, name, grade, checked_in FROM participants WHERE meeting_id = $1 ORDER BY NULLIF(name, ''), email`,
      [meetingId],
    ),
    query<MeetingBallotMatrix["motions"][number]>(
      `SELECT m.id, m.title, m.threshold, m.status, m.position,
              m.present_count, m.expected_count, m.result,
              ai.title AS agenda_title, ai.position AS agenda_position
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
  for (const m of mRows.rows) counts[m.id] = { agree: 0, against: 0 };

  for (const b of bRows.rows) {
    if (!votes[b.voter_email]) votes[b.voter_email] = {};
    votes[b.voter_email][String(b.motion_id)] = b.vote_status;
    const c = counts[b.motion_id];
    if (c) c[b.vote_status] += 1;
  }

  return {
    meeting_id: meetingId,
    participants: await fillNames(pRows.rows),
    motions: mRows.rows,
    votes,
    counts,
  };
}
