import "server-only";
import { pool, query } from "@/lib/db";
import { toDatetimeLocal } from "@/lib/time";
import { ValidationError } from "@/lib/validation";

interface BackupParticipant {
  email: string;
  grade: string;
  checked_in: boolean;
  checked_in_at: string | null;
}

interface BackupAttachment {
  filename: string;
  mime: string;
  size: number;
  storage_path: string;
}

interface BackupBallot {
  voter_email: string;
  vote_status: string;
  created_at: string;
}

interface BackupMotion {
  title: string;
  description: string;
  threshold: string;
  status: string;
  position: number;
  ballots: BackupBallot[];
}

interface BackupAgendaItem {
  title: string;
  description: string;
  position: number;
  motions: BackupMotion[];
  attachments: BackupAttachment[];
}

interface BackupMeeting {
  title: string;
  department: string;
  meeting_date: string;
  starts_at: string;
  owner_sub: string;
  owner_email: string;
  owner_name: string;
  location: string;
  online_link: string;
  description: string;
  status: string;
  participants: BackupParticipant[];
  agenda: BackupAgendaItem[];
  notes: { author_email: string; author_name: string; body: string; created_at: string }[];
}

export interface BackupData {
  version: 2;
  exported_at: string;
  meetings: BackupMeeting[];
}

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();

export async function exportAll(): Promise<BackupData> {
  const [mRows, pRows, aRows, mRows2, atRows, bRows, nRows] = await Promise.all([
    query<{
      id: number; title: string; department: string; meeting_date: string;
      starts_at: Date; owner_sub: string; owner_email: string; owner_name: string;
      location: string; online_link: string; description: string; status: string;
    }>(
      `SELECT id, title, department, meeting_date::text AS meeting_date, starts_at,
              owner_sub, owner_email, owner_name, location, online_link, description, status
         FROM meetings ORDER BY id`,
    ),
    query<{ meeting_id: number; email: string; grade: string; checked_in: boolean; checked_in_at: Date | null }>(
      `SELECT meeting_id, email, grade, checked_in, checked_in_at FROM participants ORDER BY id`,
    ),
    query<{ id: number; meeting_id: number; position: number; title: string; description: string }>(
      `SELECT id, meeting_id, position, title, description FROM agenda_items ORDER BY id`,
    ),
    query<{ id: number; agenda_item_id: number; position: number; title: string; description: string; threshold: string; status: string }>(
      `SELECT id, agenda_item_id, position, title, description, threshold, status FROM motions ORDER BY id`,
    ),
    query<{ agenda_item_id: number; filename: string; mime: string; size: number; storage_path: string }>(
      `SELECT agenda_item_id, filename, mime, size, storage_path FROM agenda_attachments ORDER BY id`,
    ),
    query<{ motion_id: number; voter_email: string; vote_status: string; created_at: Date }>(
      `SELECT motion_id, voter_email, vote_status, created_at FROM ballots ORDER BY id`,
    ),
    query<{ meeting_id: number; author_email: string; author_name: string; body: string; created_at: Date }>(
      `SELECT meeting_id, author_email, author_name, body, created_at FROM meeting_notes ORDER BY id`,
    ),
  ]);

  const participantsByMeeting = new Map<number, BackupParticipant[]>();
  for (const p of pRows.rows) {
    const list = participantsByMeeting.get(p.meeting_id) ?? [];
    list.push({ email: p.email, grade: p.grade, checked_in: p.checked_in, checked_in_at: p.checked_in_at ? iso(p.checked_in_at) : null });
    participantsByMeeting.set(p.meeting_id, list);
  }

  const motionsByAgenda = new Map<number, BackupMotion[]>();
  for (const m2 of mRows2.rows) {
    const list = motionsByAgenda.get(m2.agenda_item_id) ?? [];
    list.push({ title: m2.title, description: m2.description, threshold: m2.threshold, status: m2.status, position: m2.position, ballots: [] });
    motionsByAgenda.set(m2.agenda_item_id, list);
  }
  const motionIdToKey = new Map<number, { agenda_item_id: number; position: number }>();
  for (const m2 of mRows2.rows) motionIdToKey.set(m2.id, { agenda_item_id: m2.agenda_item_id, position: m2.position });

  for (const b of bRows.rows) {
    const key = motionIdToKey.get(b.motion_id);
    if (!key) continue;
    const list = motionsByAgenda.get(key.agenda_item_id);
    const mot = list?.find((x) => x.position === key.position);
    mot?.ballots.push({ voter_email: b.voter_email, vote_status: b.vote_status, created_at: iso(b.created_at) });
  }

  const attachmentsByAgenda = new Map<number, BackupAttachment[]>();
  for (const a of atRows.rows) {
    const list = attachmentsByAgenda.get(a.agenda_item_id) ?? [];
    list.push({ filename: a.filename, mime: a.mime, size: Number(a.size), storage_path: a.storage_path });
    attachmentsByAgenda.set(a.agenda_item_id, list);
  }

  const agendaByMeeting = new Map<number, BackupAgendaItem[]>();
  for (const a of aRows.rows) {
    const list = agendaByMeeting.get(a.meeting_id) ?? [];
    list.push({ title: a.title, description: a.description, position: a.position, motions: motionsByAgenda.get(a.id) ?? [], attachments: attachmentsByAgenda.get(a.id) ?? [] });
    agendaByMeeting.set(a.meeting_id, list);
  }

  const notesByMeeting = new Map<number, BackupMeeting["notes"]>();
  for (const n of nRows.rows) {
    const list = notesByMeeting.get(n.meeting_id) ?? [];
    list.push({ author_email: n.author_email, author_name: n.author_name, body: n.body, created_at: iso(n.created_at) });
    notesByMeeting.set(n.meeting_id, list);
  }

  const meetings: BackupMeeting[] = mRows.rows.map((m) => ({
    title: m.title,
    department: m.department,
    meeting_date: m.meeting_date,
    starts_at: iso(m.starts_at),
    owner_sub: m.owner_sub,
    owner_email: m.owner_email,
    owner_name: m.owner_name,
    location: m.location,
    online_link: m.online_link,
    description: m.description,
    status: m.status,
    participants: participantsByMeeting.get(m.id) ?? [],
    agenda: agendaByMeeting.get(m.id) ?? [],
    notes: notesByMeeting.get(m.id) ?? [],
  }));

  return { version: 2, exported_at: new Date().toISOString(), meetings };
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || !v) throw new ValidationError(`匯入檔案缺少 ${field}`);
  return v;
}

export async function importAll(data: unknown): Promise<number> {
  if (typeof data !== "object" || data === null || (data as BackupData).version !== 2) {
    throw new ValidationError("匯入檔案格式不正確（缺少 version=2）");
  }
  const meetings = (data as BackupData).meetings;
  if (!Array.isArray(meetings)) throw new ValidationError("匯入檔案格式不正確（缺少 meetings）");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "TRUNCATE ballots, agenda_attachments, motions, agenda_items, meeting_notes, participants, meetings RESTART IDENTITY CASCADE",
    );

    for (const raw of meetings) {
      if (typeof raw !== "object" || raw === null) throw new ValidationError("匯入檔案格式不正確");
      const m = raw as BackupMeeting;
      const title = requireString(m.title, "title");
      const startsAt = requireString(m.starts_at, "starts_at");
      const startsAtDate = new Date(startsAt);
      if (Number.isNaN(startsAtDate.getTime())) throw new ValidationError("starts_at 格式不正確");
      const meetingDate = toDatetimeLocal(startsAtDate).slice(0, 10);

      const meeting = await client.query<{ id: number }>(
        `INSERT INTO meetings (title, department, meeting_date, starts_at, owner_sub, owner_email, owner_name,
                               location, online_link, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          title,
          requireString(m.department, "department"),
          meetingDate,
          startsAtDate.toISOString(),
          requireString(m.owner_sub, "owner_sub"),
          typeof m.owner_email === "string" ? m.owner_email : "",
          requireString(m.owner_name, "owner_name"),
          m.location ?? "",
          m.online_link ?? "",
          m.description ?? "",
          m.status ?? "draft",
        ],
      );
      const meetingId = meeting.rows[0].id;

      for (const p of m.participants ?? []) {
        await client.query(
          `INSERT INTO participants (meeting_id, email, grade, checked_in, checked_in_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [meetingId, requireString(p.email, "participant.email"), p.grade ?? "",
           p.checked_in === true, p.checked_in_at ? new Date(p.checked_in_at).toISOString() : null],
        );
      }

      for (const ai of m.agenda ?? []) {
        const agenda = await client.query<{ id: number }>(
          `INSERT INTO agenda_items (meeting_id, position, title, description)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [meetingId, Number(ai.position) || 0, requireString(ai.title, "agenda.title"), ai.description ?? ""],
        );
        const agendaId = agenda.rows[0].id;

        for (const att of ai.attachments ?? []) {
          await client.query(
            `INSERT INTO agenda_attachments (agenda_item_id, filename, mime, size, storage_path)
             VALUES ($1, $2, $3, $4, $5)`,
            [agendaId, requireString(att.filename, "attachment.filename"), att.mime ?? "",
             Number(att.size) || 0, requireString(att.storage_path, "attachment.storage_path")],
          );
        }

        for (const mo of ai.motions ?? []) {
          const motion = await client.query<{ id: number }>(
            `INSERT INTO motions (agenda_item_id, title, description, threshold, status, position)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [agendaId, requireString(mo.title, "motion.title"), mo.description ?? "",
             mo.threshold ?? "1/2+1/2", mo.status ?? "", Number(mo.position) || 0],
          );
          const motionId = motion.rows[0].id;
          for (const b of mo.ballots ?? []) {
            await client.query(
              `INSERT INTO ballots (motion_id, voter_email, vote_status, created_at) VALUES ($1, $2, $3, $4)`,
              [motionId, requireString(b.voter_email, "ballot.voter_email"),
               b.vote_status === "against" || b.vote_status === "abstain" ? b.vote_status : "agree",
               new Date(b.created_at).toISOString()],
            );
          }
        }
      }

      for (const n of m.notes ?? []) {
        await client.query(
          `INSERT INTO meeting_notes (meeting_id, author_email, author_name, body, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [meetingId, requireString(n.author_email, "note.author_email"), requireString(n.author_name, "note.author_name"),
           requireString(n.body, "note.body"), new Date(n.created_at).toISOString()],
        );
      }
    }

    await client.query("COMMIT");
    return meetings.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
