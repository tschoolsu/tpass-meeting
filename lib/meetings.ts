import "server-only";
import { pool, query } from "@/lib/db";
import { parseTaipeiLocal } from "@/lib/time";
import type { MotionResult } from "@/lib/threshold";
import { deleteAttachmentFile } from "@/lib/attachment-store";
import { fillNames } from "@/lib/name-map";

export interface Meeting {
  id: number;
  title: string;
  department: string;
  meeting_date: string;
  starts_at: string;
  owner_sub: string;
  owner_email: string;
  owner_name: string;
  voting_enabled: boolean;
  location: string;
  online_link: string;
  description: string;
  status: string;
  current_agenda_item_id: number | null;
  created_at: string;
}

export interface MeetingListItem extends Meeting {
  participant_count: number;
  checked_count: number;
}

export interface Participant {
  id: number;
  email: string;
  /** 對方登入簽到／投票後才有；沒有就用 displayName 退回 email。 */
  name: string;
  grade: string;
  checked_in: boolean;
  checked_in_at: string | null;
}

export type VoteStatus = "agree" | "against";

// 表決案（一對多掛在某個議程項目下）
export interface Motion {
  id: number;
  agenda_item_id: number;
  title: string;
  description: string;
  threshold: string;
  status: "" | "open" | "closed";
  position: number;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
  /** 結算當下的已簽到／應到；NULL＝未結算或舊資料（顯示層用即時數推算）。 */
  present_count: number | null;
  expected_count: number | null;
  result: MotionResult | null;
}

export interface MotionWithCount extends Motion {
  agree: number;
  against: number;
}

export interface AgendaItem {
  id: number;
  meeting_id: number;
  position: number;
  title: string;
  description: string;
  created_at: string;
}

export interface AgendaItemFull extends AgendaItem {
  motions: MotionWithCount[];
  attachments: AgendaAttachment[];
}

export interface AgendaAttachment {
  id: number;
  agenda_item_id: number;
  filename: string;
  mime: string;
  size: number;
  storage_path: string;
  uploaded_at: string;
}

export interface MeetingNote {
  id: number;
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface MeetingDetail {
  meeting: Meeting;
  participants: Participant[];
  agenda: AgendaItemFull[];
  current: AgendaItemFull | null;
  notes: MeetingNote[];
}

const meetingCols =
  "m.id, m.title, m.department, m.meeting_date::text AS meeting_date, m.starts_at, m.owner_sub, m.owner_email, m.owner_name, m.voting_enabled, m.location, m.online_link, m.description, m.status, m.current_agenda_item_id, m.created_at";

export const motionCols =
  "id, agenda_item_id, title, description, threshold, status, position, created_at, opened_at, closed_at, present_count, expected_count, result";

export async function listMeetings(): Promise<MeetingListItem[]> {
  const { rows } = await query<MeetingListItem>(`
    SELECT ${meetingCols},
           COUNT(DISTINCT p.id)::int AS participant_count,
           COUNT(DISTINCT p.id) FILTER (WHERE p.checked_in)::int AS checked_count
    FROM meetings m
    LEFT JOIN participants p ON p.meeting_id = m.id
    GROUP BY m.id
    ORDER BY m.meeting_date DESC, m.id DESC
  `);
  return rows;
}

// 一般學生（default）能看到自己受邀的會議，且只能看到這些。
export async function listMyMeetings(email: string): Promise<MeetingListItem[]> {
  const { rows } = await query<MeetingListItem>(`
    SELECT ${meetingCols},
           COUNT(DISTINCT p.id)::int AS participant_count,
           COUNT(DISTINCT p.id) FILTER (WHERE p.checked_in)::int AS checked_count
    FROM meetings m
    JOIN participants p ON p.meeting_id = m.id
    WHERE p.email = LOWER($1)
    GROUP BY m.id
    ORDER BY m.meeting_date DESC, m.id DESC
  `, [email]);
  return rows;
}

export async function getMeeting(id: number): Promise<Meeting | null> {
  const { rows } = await query<Meeting>(
    `SELECT ${meetingCols} FROM meetings m WHERE m.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function countMeetings(): Promise<number> {
  const { rows } = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM meetings`,
  );
  return rows[0]?.count ?? 0;
}

// 會議目前的「現行」議程：以 DB current_agenda_item_id 為準，未設定時退回第一個。
export function currentAgendaItem(
  agenda: AgendaItemFull[],
  currentId: number | null = null,
): AgendaItemFull | null {
  return (
    (currentId != null ? agenda.find((a) => a.id === currentId) ?? null : null) ?? agenda[0] ?? null
  );
}

export async function getMeetingDetail(id: number): Promise<MeetingDetail | null> {
  // C-1：原本這函式用 Promise.all 平行跑 7 條查詢（1 個 request 同時吃 7 條 pool 連線），
  // pool 一滿 request 就無限排隊。現在併成 3 條查詢：
  //   1) meeting + participants + notes（json_agg 子查詢）
  //   2) agenda_items + attachments（json_agg 子查詢）
  //   3) motions + ballots 計數（一次 GROUP BY 掃完）
  // 單一 request 最多只佔 1–2 條連線，多人同時使用時連線池壓力大幅下降。
  const [detailRow, aRows] = await Promise.all([
    query<{
      id: number;
      title: string;
      department: string;
      meeting_date: string;
      starts_at: string;
      owner_sub: string;
      owner_email: string;
      owner_name: string;
      voting_enabled: boolean;
      location: string;
      online_link: string;
      description: string;
      status: string;
      current_agenda_item_id: number | null;
      created_at: string;
      participants: unknown;
      notes: unknown;
    }>(
      `SELECT ${meetingCols},
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', p.id, 'meeting_id', p.meeting_id, 'email', p.email, 'name', p.name, 'grade', p.grade,
                  'checked_in', p.checked_in, 'checked_in_at', p.checked_in_at)
                  ORDER BY p.checked_in DESC, p.email ASC)
                FROM participants p WHERE p.meeting_id = m.id
              ), '[]'::json) AS participants,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', n.id, 'author_email', n.author_email, 'author_name', n.author_name,
                  'body', n.body, 'created_at', n.created_at)
                  ORDER BY n.id DESC)
                FROM meeting_notes n WHERE n.meeting_id = m.id
              ), '[]'::json) AS notes
         FROM meetings m
        WHERE m.id = $1`,
      [id],
    ),
    query<{
      id: number;
      meeting_id: number;
      position: number;
      title: string;
      description: string;
      created_at: string;
      attachments: unknown;
    }>(
      `SELECT a.id, a.meeting_id, a.position, a.title, a.description, a.created_at,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', at2.id, 'agenda_item_id', at2.agenda_item_id, 'filename', at2.filename,
                  'mime', at2.mime, 'size', at2.size, 'storage_path', at2.storage_path, 'uploaded_at', at2.uploaded_at)
                  ORDER BY at2.id ASC)
                FROM agenda_attachments at2 WHERE at2.agenda_item_id = a.id
              ), '[]'::json) AS attachments
         FROM agenda_items a
        WHERE a.meeting_id = $1
        ORDER BY a.position ASC, a.id ASC`,
      [id],
    ),
  ]);

  const row = detailRow.rows[0];
  if (!row) return null;
  const meeting: Meeting = {
    id: row.id,
    title: row.title,
    department: row.department,
    meeting_date: row.meeting_date,
    starts_at: row.starts_at,
    owner_sub: row.owner_sub,
    owner_email: row.owner_email,
    owner_name: row.owner_name,
    voting_enabled: row.voting_enabled,
    location: row.location,
    online_link: row.online_link,
    description: row.description,
    status: row.status,
    current_agenda_item_id: row.current_agenda_item_id,
    created_at: row.created_at,
  };
  // 名字三層退回：DB name（登入回填）→ name-map.csv 對照表 → 空字串（顯示層再退回 email）
  const participants = await fillNames((row.participants as Participant[]) ?? []);
  const notes = (row.notes as MeetingNote[]) ?? [];

  const mRows = await query<MotionWithCount>(
    `SELECT mo.id, mo.agenda_item_id, mo.title, mo.description, mo.threshold, mo.status, mo.position, mo.created_at,
            mo.opened_at, mo.closed_at, mo.present_count, mo.expected_count, mo.result,
            COALESCE(COUNT(b.id) FILTER (WHERE b.vote_status = 'agree'), 0)::int AS agree,
            COALESCE(COUNT(b.id) FILTER (WHERE b.vote_status = 'against'), 0)::int AS against
       FROM motions mo
       JOIN agenda_items a ON a.id = mo.agenda_item_id
       LEFT JOIN ballots b ON b.motion_id = mo.id
      WHERE a.meeting_id = $1
      GROUP BY mo.id
      ORDER BY mo.position ASC, mo.id ASC`,
    [id],
  );

  const motionByItem = new Map<number, MotionWithCount[]>();
  for (const m2 of mRows.rows) {
    const list = motionByItem.get(m2.agenda_item_id) ?? [];
    list.push(m2);
    motionByItem.set(m2.agenda_item_id, list);
  }

  const agenda: AgendaItemFull[] = aRows.rows.map((a) => ({
    id: a.id,
    meeting_id: a.meeting_id,
    position: a.position,
    title: a.title,
    description: a.description,
    created_at: a.created_at,
    motions: motionByItem.get(a.id) ?? [],
    attachments: (a.attachments as AgendaAttachment[]) ?? [],
  }));

  const current =
    agenda.find((a) => a.id === meeting.current_agenda_item_id) ??
    agenda.find((a) => a.motions.some((m) => m.status === "open")) ??
    agenda[0] ??
    null;

  return {
    meeting,
    participants,
    agenda,
    current,
    notes,
  };
}

export async function isParticipant(meetingId: number, email: string): Promise<boolean> {
  const { rows } = await query<{ one: number }>(
    `SELECT 1 AS one FROM participants WHERE meeting_id = $1 AND email = LOWER($2)`,
    [meetingId, email],
  );
  return rows.length > 0;
}

// 讀取會議的權限判定（SEC-001）：管理員／moderator、會議建立者（以 sub 比對）、
// 或受邀參與人方可讀取；一般學生僅能讀取自己受邀的會議。
export function canViewMeeting(
  meeting: Pick<Meeting, "owner_sub" | "id">,
  session: { sub: string; email: string },
  isManager: boolean,
  isParticipantOfMeeting: boolean,
): boolean {
  if (isManager) return true;
  if (meeting.owner_sub === session.sub) return true;
  return isParticipantOfMeeting;
}

export async function getCheckInState(meetingId: number, email: string): Promise<boolean> {
  const { rows } = await query<{ checked_in: boolean }>(
    `SELECT checked_in FROM participants WHERE meeting_id = $1 AND email = LOWER($2)`,
    [meetingId, email],
  );
  return rows[0]?.checked_in ?? false;
}

export async function setCheckIn(meetingId: number, email: string): Promise<"ok" | "already" | "not-invited"> {
  const { rowCount } = await query(
    `UPDATE participants
        SET checked_in = TRUE, checked_in_at = COALESCE(checked_in_at, now())
      WHERE meeting_id = $1 AND email = LOWER($2) AND checked_in = FALSE`,
    [meetingId, email],
  );
  if (rowCount > 0) return "ok";
  const invited = await isParticipant(meetingId, email);
  return invited ? "already" : "not-invited";
}

// 名字回填：邀請時只知道 email，對方用 Google 登入來簽到／投票時把 JWT 的 name 寫回去。
export async function rememberParticipantName(meetingId: number, email: string, name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  await query(
    `UPDATE participants SET name = $3 WHERE meeting_id = $1 AND email = LOWER($2) AND name <> $3`,
    [meetingId, email, n],
  );
}

export async function rememberEditorName(meetingId: number, email: string, name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  await query(
    `UPDATE meeting_editors SET name = $3 WHERE meeting_id = $1 AND email = LOWER($2) AND name <> $3`,
    [meetingId, email, n],
  );
}

export async function addNote(
  meetingId: number,
  author: { sub?: string; email: string; name: string },
  body: string,
): Promise<void> {
  await query(
    `INSERT INTO meeting_notes (meeting_id, author_email, author_name, author_sub, body)
     VALUES ($1, $2, $3, $4, $5)`,
    [meetingId, author.email, author.name, author.sub ?? null, body],
  );
}

// ---- 會議記錄權限（需求：Creator + Authorized Member 才可新增/編輯） ----

// 是否為該會議的「可寫記錄」人員：admin 或 創建者 或 被授權協作者。
export async function canWriteNotes(
  meeting: Pick<Meeting, "owner_sub" | "id">,
  session: { sub: string; email: string },
  isAdminUser: boolean,
): Promise<boolean> {
  if (isAdminUser || meeting.owner_sub === session.sub) return true;
  return isMeetingEditor(meeting.id, session.email);
}

// 是否為被明確授權的協作者。
export async function isMeetingEditor(meetingId: number, email: string): Promise<boolean> {
  const { rows } = await query<{ email: string }>(
    `SELECT email FROM meeting_editors WHERE meeting_id = $1 AND email = $2`,
    [meetingId, email.toLowerCase()],
  );
  return rows.length > 0;
}

// 授權某人成為該會議的「可寫記錄」協作者（冪等）。
export async function addMeetingEditor(
  meetingId: number,
  email: string,
  grantedBy: string,
): Promise<void> {
  await query(
    `INSERT INTO meeting_editors (meeting_id, email, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (meeting_id, email) DO NOTHING`,
    [meetingId, email.toLowerCase(), grantedBy],
  );
}

// ---- 會議 CRUD ----

export interface MeetingInput {
  title: string;
  department: string;
  startsAt: string; // datetime-local（UTC+8）
  participantEmails: string[];
  location: string;
  onlineLink: string;
  description: string;
}

function splitStartsAt(startsAt: string): { meetingDate: string; startsAtIso: string } {
  const meetingDate = startsAt.slice(0, 10);
  const startsAtIso = parseTaipeiLocal(startsAt).toISOString();
  return { meetingDate, startsAtIso };
}

export async function createMeeting(input: MeetingInput, owner: { sub: string; email: string; name: string }): Promise<number> {
  const { meetingDate, startsAtIso } = splitStartsAt(input.startsAt);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const meeting = await client.query<{ id: number }>(
      `INSERT INTO meetings (title, department, meeting_date, starts_at, owner_sub, owner_email, owner_name,
                             location, online_link, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft') RETURNING id`,
      [input.title, input.department, meetingDate, startsAtIso, owner.sub, owner.email, owner.name,
       input.location, input.onlineLink, input.description],
    );
    const meetingId = meeting.rows[0].id;

    if (input.participantEmails.length > 0) {
      const params: unknown[] = [];
      const tuples = input.participantEmails
        .map((email, i) => {
          const base = i * 3;
          params.push(meetingId, email, "");
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        })
        .join(", ");
      await client.query(`INSERT INTO participants (meeting_id, email, grade) VALUES ${tuples}`, params);
    }

    await client.query("COMMIT");
    return meetingId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// 只更新基本資料。名單刻意不在這裡動——以前這裡會把「不在表單裡的人」整批 DELETE，
// 編輯一次會議就砍掉已簽到的人；名單現在只有工作台 ② 一個入口（add／remove 各自一顆 action）。
export async function updateMeeting(
  id: number,
  input: Omit<MeetingInput, "participantEmails">,
  ownerSub: string,
  isAdmin: boolean,
): Promise<boolean> {
  const meeting = await getMeeting(id);
  if (!meeting) return false;
  if (!isAdmin && meeting.owner_sub !== ownerSub) return false;

  const { meetingDate, startsAtIso } = splitStartsAt(input.startsAt);
  await query(
    `UPDATE meetings
        SET title = $1, department = $2, meeting_date = $3, starts_at = $4,
            location = $5, online_link = $6, description = $7
      WHERE id = $8`,
    [input.title, input.department, meetingDate, startsAtIso, input.location, input.onlineLink, input.description, id],
  );
  return true;
}

// 從名單移除一個人。只動 participants；他已投的票（ballots 以 email 記）不受影響。
// DINT-001：已簽到者保留出席紀錄，不可移除。
export async function removeParticipant(meetingId: number, email: string): Promise<"removed" | "not-found" | "checked-in"> {
  const { rows } = await query<{ checked_in: boolean }>(
    `SELECT checked_in FROM participants WHERE meeting_id = $1 AND email = $2`,
    [meetingId, email.toLowerCase()],
  );
  if (rows.length === 0) return "not-found";
  if (rows[0].checked_in) return "checked-in";
  await query(`DELETE FROM participants WHERE meeting_id = $1 AND email = $2`, [meetingId, email.toLowerCase()]);
  return "removed";
}

export async function deleteMeeting(id: number, ownerSub: string, isAdmin: boolean): Promise<boolean> {
  const meeting = await getMeeting(id);
  if (!meeting) return false;
  if (!isAdmin && meeting.owner_sub !== ownerSub) return false;

  // 子表全部 ON DELETE CASCADE；只有附件的實體檔案要自己清（先撈路徑，DB 刪掉後就找不到了）。
  const { rows: files } = await query<{ storage_path: string }>(
    `SELECT a.storage_path
       FROM agenda_attachments a
       JOIN agenda_items ai ON ai.id = a.agenda_item_id
      WHERE ai.meeting_id = $1`,
    [id],
  );
  const { rowCount } = await query(`DELETE FROM meetings WHERE id = $1`, [id]);
  if (rowCount > 0) await removeAttachmentFiles(files.map((f) => f.storage_path));
  return rowCount > 0;
}

// 盡力刪檔：DB 已經刪成功，檔案刪不掉只留 log，不對使用者報錯。
export async function removeAttachmentFiles(paths: string[]): Promise<void> {
  const results = await Promise.allSettled(paths.map((p) => deleteAttachmentFile(p)));
  for (const [i, r] of results.entries()) {
    if (r.status === "rejected") console.error(`[attachments] 刪除檔案失敗：${paths[i]}`, r.reason);
  }
}

export interface MeetingEditor {
  email: string;
  name: string;
  granted_by: string;
}

// 該會議的協作者名單（工作台 ④ 顯示用）。
export async function listMeetingEditors(meetingId: number): Promise<MeetingEditor[]> {
  const { rows } = await query<MeetingEditor>(
    `SELECT email, name, granted_by FROM meeting_editors WHERE meeting_id = $1 ORDER BY email`,
    [meetingId],
  );
  return fillNames(rows);
}
