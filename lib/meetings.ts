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
  created_at: string;
}

export interface MeetingListItem extends Meeting {
  participant_count: number;
  checked_count: number;
}

export interface Participant {
  id: number;
  email: string;
  checked_in: boolean;
  checked_in_at: string | null;
}

// 一次表決 = 一場會議一個 vote id，內含多題（vote_questions）。
export interface VoteSession {
  id: number;
  meeting_id: number;
  created_at: string;
}

export interface VoteQuestion {
  id: number;
  vote_id: number;
  question: string;
  position: number;
}

export interface VoteQuestionWithCount extends VoteQuestion {
  yes: number;
  no: number;
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
  vote: { id: number; questions: VoteQuestionWithCount[] } | null;
  notes: MeetingNote[];
}

export interface VoteFlow {
  meeting: Meeting;
  vote: VoteSession;
  questions: VoteQuestionWithCount[];
  answered: Set<number>;
  firstUnansweredId: number | null;
  remaining: number;
}

const meetingCols =
  "m.id, m.title, m.department, m.meeting_date::text AS meeting_date, m.starts_at, m.owner_sub, m.owner_email, m.owner_name, m.voting_enabled, m.created_at";

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

export async function getMeetingDetail(id: number): Promise<MeetingDetail | null> {
  const meeting = await getMeeting(id);
  if (!meeting) return null;

  const [voteRows, pRows, nRows] = await Promise.all([
    query<VoteSession>(
      `SELECT id, meeting_id, created_at FROM votes WHERE meeting_id = $1`,
      [id],
    ),
    query<Participant>(
      `SELECT id, email, checked_in, checked_in_at
         FROM participants
        WHERE meeting_id = $1
        ORDER BY checked_in DESC, email ASC`,
      [id],
    ),
    query<MeetingNote>(
      `SELECT id, author_email, author_name, body, created_at
         FROM meeting_notes
        WHERE meeting_id = $1
        ORDER BY id DESC`,
      [id],
    ),
  ]);

  const vote = voteRows.rows[0] ?? null;
  const qRows = vote
    ? await query<VoteQuestionWithCount>(
        `SELECT q.id, q.vote_id, q.question, q.position,
                COUNT(b.id) FILTER (WHERE b.answer)::int AS yes,
                COUNT(b.id) FILTER (WHERE NOT b.answer)::int AS no
           FROM vote_questions q
           LEFT JOIN ballots b ON b.question_id = q.id
          WHERE q.vote_id = $1
          GROUP BY q.id
          ORDER BY q.position ASC, q.id ASC`,
        [vote.id],
      )
    : { rows: [], rowCount: 0 };

  return {
    meeting,
    participants: pRows.rows,
    vote: vote ? { id: vote.id, questions: qRows.rows } : null,
    notes: nRows.rows,
  };
}

export async function getVoteResults(voteId: number) {
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM votes WHERE id = $1`,
    [voteId],
  );
  if (rows.length === 0) return null;

  const { rows: questions } = await query<VoteQuestionWithCount>(
    `SELECT q.id, q.vote_id, q.question, q.position,
            COUNT(b.id) FILTER (WHERE b.answer)::int AS yes,
            COUNT(b.id) FILTER (WHERE NOT b.answer)::int AS no
       FROM vote_questions q
       LEFT JOIN ballots b ON b.question_id = q.id
      WHERE q.vote_id = $1
      GROUP BY q.id
      ORDER BY q.position ASC, q.id ASC`,
    [voteId],
  );

  return {
    vote_id: voteId,
    questions: questions.map((q) => {
      const total = q.yes + q.no;
      const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
      return {
        id: q.id,
        question: q.question,
        yes: q.yes,
        no: q.no,
        total,
        yes_percent: pct(q.yes),
        no_percent: pct(q.no),
      };
    }),
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

export async function countUnanswered(meetingId: number, email: string): Promise<number> {
  const { rows } = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM votes v
       JOIN vote_questions q ON q.vote_id = v.id
       LEFT JOIN ballots b ON b.question_id = q.id AND b.voter_email = $2
      WHERE v.meeting_id = $1 AND b.id IS NULL`,
    [meetingId, email],
  );
  return rows[0]?.count ?? 0;
}

export async function getMyAnsweredQuestionIds(meetingId: number, email: string): Promise<Set<number>> {
  const { rows } = await query<{ id: number }>(
    `SELECT q.id
       FROM vote_questions q
       JOIN votes v ON v.id = q.vote_id
       JOIN ballots b ON b.question_id = q.id
      WHERE v.meeting_id = $1 AND b.voter_email = $2`,
    [meetingId, email],
  );
  return new Set(rows.map((r) => r.id));
}

export async function getVoteFlow(voteId: number, email: string): Promise<VoteFlow | null> {
  const { rows } = await query<VoteSession>(
    `SELECT id, meeting_id, created_at FROM votes WHERE id = $1`,
    [voteId],
  );
  const vote = rows[0];
  if (!vote) return null;

  const meeting = await getMeeting(vote.meeting_id);
  if (!meeting) return null;

  const [qRows, aRows] = await Promise.all([
    query<VoteQuestionWithCount>(
      `SELECT q.id, q.vote_id, q.question, q.position,
              COUNT(b.id) FILTER (WHERE b.answer)::int AS yes,
              COUNT(b.id) FILTER (WHERE NOT b.answer)::int AS no
         FROM vote_questions q
         LEFT JOIN ballots b ON b.question_id = q.id
        WHERE q.vote_id = $1
        GROUP BY q.id
        ORDER BY q.position ASC, q.id ASC`,
      [vote.id],
    ),
    query<{ question_id: number }>(
      `SELECT question_id FROM ballots WHERE question_id IN (
         SELECT id FROM vote_questions WHERE vote_id = $1
       ) AND voter_email = $2`,
      [vote.id, email],
    ),
  ]);

  const questions = qRows.rows;
  const answered = new Set(aRows.rows.map((r) => r.question_id));
  const firstUnanswered = questions.find((q) => !answered.has(q.id));

  return {
    meeting,
    vote,
    questions,
    answered,
    firstUnansweredId: firstUnanswered?.id ?? null,
    remaining: questions.filter((q) => !answered.has(q.id)).length,
  };
}

export interface MeetingInput {
  title: string;
  department: string;
  startsAt: string; // datetime-local 值（Asia/Taipei）："YYYY-MM-DDTHH:MM"
  participantEmails: string[];
  votingEnabled: boolean;
  questions: string[];
}

// 由 UTC+8 的開始時間推出生日曆日期，並轉成 timestamptz 的 ISO 字串。
function splitStartsAt(startsAt: string): { meetingDate: string; startsAtIso: string } {
  const meetingDate = startsAt.slice(0, 10);
  const startsAtIso = parseTaipeiLocal(startsAt).toISOString();
  return { meetingDate, startsAtIso };
}

async function insertQuestions(
  client: import("pg").PoolClient,
  voteId: number,
  questions: string[],
): Promise<void> {
  const params: unknown[] = [];
  const tuples = questions
    .map((q, i) => {
      const base = i * 3;
      params.push(voteId, q, i);
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    })
    .join(", ");
  await client.query(
    `INSERT INTO vote_questions (vote_id, question, position) VALUES ${tuples}`,
    params,
  );
}

export async function createMeeting(input: MeetingInput, owner: { sub: string; email: string; name: string }): Promise<number> {
  const { meetingDate, startsAtIso } = splitStartsAt(input.startsAt);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const meeting = await client.query<{ id: number }>(
      `INSERT INTO meetings (title, department, meeting_date, starts_at, owner_sub, owner_email, owner_name, voting_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [input.title, input.department, meetingDate, startsAtIso, owner.sub, owner.email, owner.name, input.votingEnabled],
    );
    const meetingId = meeting.rows[0].id;

    if (input.participantEmails.length > 0) {
      const params: unknown[] = [];
      const tuples = input.participantEmails
        .map((email, i) => {
          const base = i * 2;
          params.push(meetingId, email);
          return `($${base + 1}, $${base + 2})`;
        })
        .join(", ");
      await client.query(`INSERT INTO participants (meeting_id, email) VALUES ${tuples}`, params);
    }

    if (input.votingEnabled && input.questions.length > 0) {
      const vote = await client.query<{ id: number }>(
        `INSERT INTO votes (meeting_id) VALUES ($1) RETURNING id`,
        [meetingId],
      );
      await insertQuestions(client, vote.rows[0].id, input.questions);
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
          SET title = $1, department = $2, meeting_date = $3, starts_at = $4, voting_enabled = $5
        WHERE id = $6`,
      [input.title, input.department, meetingDate, startsAtIso, input.votingEnabled, id],
    );

    // 參與人重設：保留已簽到紀錄，新增未簽到的人，移除被刪除的人。
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

    if (input.votingEnabled) {
      // 確保投票 session 存在，重設題目（已投的票會跟著舊題目被刪除，這是預期行為）。
      await client.query(
        `INSERT INTO votes (meeting_id) VALUES ($1)
         ON CONFLICT (meeting_id) DO NOTHING`,
        [id],
      );
      const vote = await client.query<{ id: number }>(
        `SELECT id FROM votes WHERE meeting_id = $1`,
        [id],
      );
      await client.query(`DELETE FROM vote_questions WHERE vote_id = $1`, [vote.rows[0].id]);
      if (input.questions.length > 0) {
        await insertQuestions(client, vote.rows[0].id, input.questions);
      }
    } else {
      await client.query(`DELETE FROM votes WHERE meeting_id = $1`, [id]);
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

export async function submitBallot(questionId: number, voterEmail: string, answer: boolean): Promise<"ok" | "duplicate"> {
  const { rowCount } = await query(
    `INSERT INTO ballots (question_id, voter_email, answer)
     VALUES ($1, $2, $3)
     ON CONFLICT (question_id, voter_email) DO NOTHING`,
    [questionId, voterEmail, answer],
  );
  return rowCount > 0 ? "ok" : "duplicate";
}

export async function addNote(meetingId: number, author: { email: string; name: string }, body: string): Promise<void> {
  await query(
    `INSERT INTO meeting_notes (meeting_id, author_email, author_name, body)
     VALUES ($1, $2, $3, $4)`,
    [meetingId, author.email, author.name, body],
  );
}
