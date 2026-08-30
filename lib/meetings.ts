import "server-only";
import { pool, query } from "@/lib/db";
import { parseTaipeiLocal } from "@/lib/time";

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
  created_at: string;
}

export interface MeetingListItem extends Meeting {
  participant_count: number;
  checked_count: number;
}

export interface Participant {
  id: number;
  email: string;
  grade: string;
  checked_in: boolean;
  checked_in_at: string | null;
}

export type VoteStatus = "agree" | "against" | "abstain";

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
}

export interface MotionWithCount extends Motion {
  agree: number;
  against: number;
  abstain: number;
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
  notes: MeetingNote[];
}

const meetingCols =
  "m.id, m.title, m.department, m.meeting_date::text AS meeting_date, m.starts_at, m.owner_sub, m.owner_email, m.owner_name, m.voting_enabled, m.location, m.online_link, m.description, m.status, m.created_at";

const participantCols = "p.id, p.meeting_id, p.email, p.grade, p.checked_in, p.checked_in_at";

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
    WHERE p.email = $1
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

// 會議目前的「現行」議程：position 最小且為真者，即正在討論/展示的項目。
export function currentAgendaItem(agenda: AgendaItemFull[]): AgendaItemFull | null {
  if (agenda.length === 0) return null;
  return agenda[0];
}

export async function getMeetingDetail(id: number): Promise<MeetingDetail | null> {
  const meeting = await getMeeting(id);
  if (!meeting) return null;

  const [pRows, nRows, aRows, mRows, atRows, bRows] = await Promise.all([
    query<Participant>(
      `SELECT ${participantCols}
         FROM participants p
        WHERE p.meeting_id = $1
        ORDER BY p.checked_in DESC, p.email ASC`,
      [id],
    ),
    query<MeetingNote>(
      `SELECT id, author_email, author_name, body, created_at
         FROM meeting_notes
        WHERE meeting_id = $1
        ORDER BY id DESC`,
      [id],
    ),
    query<AgendaItem>(
      `SELECT id, meeting_id, position, title, description, created_at
         FROM agenda_items
        WHERE meeting_id = $1
        ORDER BY position ASC, id ASC`,
      [id],
    ),
    query<Motion>(
      `SELECT id, agenda_item_id, title, description, threshold, status, position, created_at
         FROM motions
        WHERE agenda_item_id IN (SELECT id FROM agenda_items WHERE meeting_id = $1)
        ORDER BY position ASC, id ASC`,
      [id],
    ),
    query<AgendaAttachment>(
      `SELECT a.id, a.agenda_item_id, a.filename, a.mime, a.size, a.storage_path, a.uploaded_at
         FROM agenda_attachments a
         JOIN agenda_items ai ON ai.id = a.agenda_item_id
        WHERE ai.meeting_id = $1
        ORDER BY a.id ASC`,
      [id],
    ),
    query<{ motion_id: number; vote_status: string; cnt: number }>(
      `SELECT motion_id, vote_status, COUNT(*)::int AS cnt
         FROM ballots
        WHERE motion_id IN (
          SELECT m.id FROM motions m
          JOIN agenda_items ai ON ai.id = m.agenda_item_id
          WHERE ai.meeting_id = $1
        )
        GROUP BY motion_id, vote_status`,
      [id],
    ),
  ]);

  const countByMotion = new Map<string, number>();
  for (const b of bRows.rows) countByMotion.set(`${b.motion_id}:${b.vote_status}`, b.cnt);
  const count = (motionId: number, status: VoteStatus) =>
    countByMotion.get(`${motionId}:${status}`) ?? 0;

  const motionByItem = new Map<number, MotionWithCount[]>();
  for (const m2 of mRows.rows) {
    const list = motionByItem.get(m2.agenda_item_id) ?? [];
    list.push({
      ...m2,
      agree: count(m2.id, "agree"),
      against: count(m2.id, "against"),
      abstain: count(m2.id, "abstain"),
    });
    motionByItem.set(m2.agenda_item_id, list);
  }

  const attachmentByItem = new Map<number, AgendaAttachment[]>();
  for (const a of atRows.rows) {
    const list = attachmentByItem.get(a.agenda_item_id) ?? [];
    list.push(a);
    attachmentByItem.set(a.agenda_item_id, list);
  }

  const agenda: AgendaItemFull[] = aRows.rows.map((a) => ({
    ...a,
    motions: motionByItem.get(a.id) ?? [],
    attachments: attachmentByItem.get(a.id) ?? [],
  }));

  return {
    meeting,
    participants: pRows.rows,
    agenda,
    notes: nRows.rows,
  };
}

export async function isParticipant(meetingId: number, email: string): Promise<boolean> {
  const { rows } = await query<{ one: number }>(
    `SELECT 1 AS one FROM participants WHERE meeting_id = $1 AND email = $2`,
    [meetingId, email],
  );
  return rows.length > 0;
}

export async function getCheckInState(meetingId: number, email: string): Promise<boolean> {
  const { rows } = await query<{ checked_in: boolean }>(
    `SELECT checked_in FROM participants WHERE meeting_id = $1 AND email = $2`,
    [meetingId, email],
  );
  return rows[0]?.checked_in ?? false;
}

export async function setCheckIn(meetingId: number, email: string): Promise<"ok" | "already" | "not-invited"> {
  const { rowCount } = await query(
    `UPDATE participants
        SET checked_in = TRUE, checked_in_at = COALESCE(checked_in_at, now())
      WHERE meeting_id = $1 AND email = $2 AND checked_in = FALSE`,
    [meetingId, email],
  );
  if (rowCount > 0) return "ok";
  const invited = await isParticipant(meetingId, email);
  return invited ? "already" : "not-invited";
}

export async function addNote(meetingId: number, author: { email: string; name: string }, body: string): Promise<void> {
  await query(
    `INSERT INTO meeting_notes (meeting_id, author_email, author_name, body)
     VALUES ($1, $2, $3, $4)`,
    [meetingId, author.email, author.name, body],
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

export async function updateMeeting(id: number, input: MeetingInput, ownerSub: string, isAdmin: boolean): Promise<boolean> {
  const meeting = await getMeeting(id);
  if (!meeting) return false;
  if (!isAdmin && meeting.owner_sub !== ownerSub) return false;

  const { meetingDate, startsAtIso } = splitStartsAt(input.startsAt);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE meetings
          SET title = $1, department = $2, meeting_date = $3, starts_at = $4,
              location = $5, online_link = $6, description = $7
        WHERE id = $8`,
      [input.title, input.department, meetingDate, startsAtIso, input.location, input.onlineLink, input.description, id],
    );

    await client.query(
      `DELETE FROM participants
        WHERE meeting_id = $1 AND email <> ALL($2::text[])`,
      [id, input.participantEmails],
    );
    for (const email of input.participantEmails) {
      await client.query(
        `INSERT INTO participants (meeting_id, email)
         VALUES ($1, $2)
         ON CONFLICT (meeting_id, email) DO NOTHING`,
        [id, email],
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteMeeting(id: number, ownerSub: string, isAdmin: boolean): Promise<boolean> {
  const meeting = await getMeeting(id);
  if (!meeting) return false;
  if (!isAdmin && meeting.owner_sub !== ownerSub) return false;

  const { rowCount } = await query(`DELETE FROM meetings WHERE id = $1`, [id]);
  return rowCount > 0;
}
