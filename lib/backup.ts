import "server-only";
import { pool, query } from "@/lib/db";
import { toDatetimeLocal } from "@/lib/time";
import { ValidationError } from "@/lib/validation";

interface BackupParticipant {
  email: string;
  checked_in: boolean;
  checked_in_at: string | null;
}

interface BackupBallot {
  voter_email: string;
  answer: boolean;
  created_at: string;
}

interface BackupQuestion {
  question: string;
  position: number;
  ballots: BackupBallot[];
}

interface BackupMeeting {
  title: string;
  department: string;
  meeting_date: string;
  starts_at: string;
  owner_sub: string;
  owner_email: string;
  owner_name: string;
  voting_enabled: boolean;
  participants: BackupParticipant[];
  votes: { questions: BackupQuestion[] }[];
  notes: { author_email: string; author_name: string; body: string; created_at: string }[];
}

export interface BackupData {
  version: 1;
  exported_at: string;
  meetings: BackupMeeting[];
}

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();

export async function exportAll(): Promise<BackupData> {
  const [mRows, pRows, vRows, qRows, bRows, nRows] = await Promise.all([
    query<{
      id: number; title: string; department: string; meeting_date: string;
      starts_at: Date; owner_sub: string; owner_email: string; owner_name: string;
      voting_enabled: boolean;
    }>(
      `SELECT id, title, department, meeting_date::text AS meeting_date, starts_at,
              owner_sub, owner_email, owner_name, voting_enabled
         FROM meetings ORDER BY id`,
    ),
    query<{ meeting_id: number; email: string; checked_in: boolean; checked_in_at: Date | null }>(
      `SELECT meeting_id, email, checked_in, checked_in_at FROM participants ORDER BY id`,
    ),
    query<{ id: number; meeting_id: number }>(
      `SELECT id, meeting_id FROM votes ORDER BY id`,
    ),
    query<{ id: number; vote_id: number; question: string; position: number }>(
      `SELECT id, vote_id, question, position FROM vote_questions ORDER BY id`,
    ),
    query<{ question_id: number; voter_email: string; answer: boolean; created_at: Date }>(
      `SELECT question_id, voter_email, answer, created_at FROM ballots ORDER BY id`,
    ),
    query<{ meeting_id: number; author_email: string; author_name: string; body: string; created_at: Date }>(
      `SELECT meeting_id, author_email, author_name, body, created_at FROM meeting_notes ORDER BY id`,
    ),
  ]);

  const participantsByMeeting = new Map<number, BackupParticipant[]>();
  for (const p of pRows.rows) {
    const list = participantsByMeeting.get(p.meeting_id) ?? [];
    list.push({ email: p.email, checked_in: p.checked_in, checked_in_at: p.checked_in_at ? iso(p.checked_in_at) : null });
    participantsByMeeting.set(p.meeting_id, list);
  }

  const questionsByVote = new Map<number, BackupQuestion[]>();
  for (const q of qRows.rows) {
    const list = questionsByVote.get(q.vote_id) ?? [];
    list.push({ question: q.question, position: q.position, ballots: [] });
    questionsByVote.set(q.vote_id, list);
  }

  // 題目 id → ballot 歸位
  const questionIdToKey = new Map<number, { vote_id: number; position: number }>();
  for (const q of qRows.rows) questionIdToKey.set(q.id, { vote_id: q.vote_id, position: q.position });
  for (const b of bRows.rows) {
    const key = questionIdToKey.get(b.question_id);
    if (!key) continue;
    const list = questionsByVote.get(key.vote_id);
    const q = list?.find((x) => x.position === key.position);
    q?.ballots.push({ voter_email: b.voter_email, answer: b.answer, created_at: iso(b.created_at) });
  }

  const notesByMeeting = new Map<number, BackupMeeting["notes"]>();
  for (const n of nRows.rows) {
    const list = notesByMeeting.get(n.meeting_id) ?? [];
    list.push({ author_email: n.author_email, author_name: n.author_name, body: n.body, created_at: iso(n.created_at) });
    notesByMeeting.set(n.meeting_id, list);
  }

  const meetings: BackupMeeting[] = mRows.rows.map((m) => {
    const voteSession = vRows.rows.find((v) => v.meeting_id === m.id);
    return {
      title: m.title,
      department: m.department,
      meeting_date: m.meeting_date,
      starts_at: iso(m.starts_at),
      owner_sub: m.owner_sub,
      owner_email: m.owner_email,
      owner_name: m.owner_name,
      voting_enabled: m.voting_enabled,
      participants: participantsByMeeting.get(m.id) ?? [],
      votes: voteSession ? [{ questions: questionsByVote.get(voteSession.id) ?? [] }] : [],
      notes: notesByMeeting.get(m.id) ?? [],
    };
  });

  return { version: 1, exported_at: new Date().toISOString(), meetings };
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || !v) throw new ValidationError(`匯入檔案缺少 ${field}`);
  return v;
}

function requireBool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") throw new ValidationError(`匯入檔案缺少 ${field}`);
  return v;
}

// 以匯入內容「取代」全部會議紀錄（交易內完成，失敗即完全還原）。
export async function importAll(data: unknown): Promise<number> {
  if (typeof data !== "object" || data === null || (data as BackupData).version !== 1) {
    throw new ValidationError("匯入檔案格式不正確（缺少 version）");
  }
  const meetings = (data as BackupData).meetings;
  if (!Array.isArray(meetings)) throw new ValidationError("匯入檔案格式不正確（缺少 meetings）");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "TRUNCATE ballots, meeting_notes, vote_questions, votes, participants, meetings RESTART IDENTITY CASCADE",
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
        `INSERT INTO meetings (title, department, meeting_date, starts_at, owner_sub, owner_email, owner_name, voting_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          title,
          requireString(m.department, "department"),
          meetingDate,
          startsAtDate.toISOString(),
          requireString(m.owner_sub, "owner_sub"),
          typeof m.owner_email === "string" ? m.owner_email : "",
          requireString(m.owner_name, "owner_name"),
          requireBool(m.voting_enabled, "voting_enabled"),
        ],
      );
      const meetingId = meeting.rows[0].id;

      for (const p of m.participants ?? []) {
        await client.query(
          `INSERT INTO participants (meeting_id, email, checked_in, checked_in_at)
           VALUES ($1, $2, $3, $4)`,
          [meetingId, requireString(p.email, "participant.email"), requireBool(p.checked_in, "participant.checked_in"),
           p.checked_in_at ? new Date(p.checked_in_at).toISOString() : null],
        );
      }

      for (const session of m.votes ?? []) {
        const vote = await client.query<{ id: number }>(
          `INSERT INTO votes (meeting_id) VALUES ($1) RETURNING id`,
          [meetingId],
        );
        const voteId = vote.rows[0].id;
        for (const q of session.questions ?? []) {
          const question = await client.query<{ id: number }>(
            `INSERT INTO vote_questions (vote_id, question, position) VALUES ($1, $2, $3) RETURNING id`,
            [voteId, requireString(q.question, "question.question"), Number(q.position) || 0],
          );
          const questionId = question.rows[0].id;
          for (const b of q.ballots ?? []) {
            await client.query(
              `INSERT INTO ballots (question_id, voter_email, answer) VALUES ($1, $2, $3)`,
              [questionId, requireString(b.voter_email, "ballot.voter_email"), requireBool(b.answer, "ballot.answer")],
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
