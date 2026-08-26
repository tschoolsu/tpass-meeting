import "server-only";
import { pool, query } from "@/lib/db";

export interface Meeting {
  id: number;
  title: string;
  department: string;
  meeting_date: string;
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

export interface Vote {
  id: number;
  meeting_id: number;
  question: string;
  position: number;
}

export interface VoteWithCount extends Vote {
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
  votes: VoteWithCount[];
  notes: MeetingNote[];
}

export interface VoteFlow {
  meeting: Meeting;
  vote: Vote;
  alreadyVoted: boolean;
  myAnswer: boolean | null;
  nextVoteId: number | null;
}

const meetingCols =
  "m.id, m.title, m.department, m.meeting_date::text AS meeting_date, m.owner_sub, m.owner_email, m.owner_name, m.voting_enabled, m.created_at";

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

export async function getMeetingDetail(id: number): Promise<MeetingDetail | null> {
  const meeting = await getMeeting(id);
  if (!meeting) return null;

  const [pRows, vRows, nRows] = await Promise.all([
    query<Participant>(
      `SELECT id, email, checked_in, checked_in_at
         FROM participants
        WHERE meeting_id = $1
        ORDER BY checked_in DESC, email ASC`,
      [id],
    ),
    query<VoteWithCount>(
      `SELECT v.id, v.meeting_id, v.question, v.position,
              COUNT(b.id) FILTER (WHERE b.answer)::int AS yes,
              COUNT(b.id) FILTER (WHERE NOT b.answer)::int AS no
         FROM votes v
         LEFT JOIN ballots b ON b.vote_id = v.id
        WHERE v.meeting_id = $1
        GROUP BY v.id
        ORDER BY v.position ASC, v.id ASC`,
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

  return {
    meeting,
    participants: pRows.rows,
    votes: vRows.rows,
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

export async function countUnanswered(meetingId: number, email: string): Promise<number> {
  const { rows } = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM votes v
       LEFT JOIN ballots b ON b.vote_id = v.id AND b.voter_email = $2
      WHERE v.meeting_id = $1 AND b.id IS NULL`,
    [meetingId, email],
  );
  return rows[0]?.count ?? 0;
}

export async function getFirstUnansweredVote(meetingId: number, email: string): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    `SELECT v.id
       FROM votes v
       LEFT JOIN ballots b ON b.vote_id = v.id AND b.voter_email = $2
      WHERE v.meeting_id = $1 AND b.id IS NULL
      ORDER BY v.position ASC, v.id ASC
      LIMIT 1`,
    [meetingId, email],
  );
  return rows[0]?.id ?? null;
}

export async function getMyVotedVoteIds(meetingId: number, email: string): Promise<Set<number>> {
  const { rows } = await query<{ vote_id: number }>(
    `SELECT b.vote_id
       FROM ballots b
       JOIN votes v ON v.id = b.vote_id
      WHERE v.meeting_id = $1 AND b.voter_email = $2`,
    [meetingId, email],
  );
  return new Set(rows.map((r) => r.vote_id));
}

export async function getVoteFlow(voteId: number, email: string): Promise<VoteFlow | null> {
  const { rows } = await query<Vote>(
    `SELECT id, meeting_id, question, position FROM votes WHERE id = $1`,
    [voteId],
  );
  const vote = rows[0];
  if (!vote) return null;

  const meeting = await getMeeting(vote.meeting_id);
  if (!meeting) return null;

  const ballot = await query<{ answer: boolean }>(
    `SELECT answer FROM ballots WHERE vote_id = $1 AND voter_email = $2`,
    [voteId, email],
  );

  const next = await query<{ id: number }>(
    `SELECT v.id
       FROM votes v
       LEFT JOIN ballots b ON b.vote_id = v.id AND b.voter_email = $2
      WHERE v.meeting_id = $1 AND b.id IS NULL AND v.id <> $3
      ORDER BY v.position ASC, v.id ASC
      LIMIT 1`,
    [meeting.id, email, vote.id],
  );

  return {
    meeting,
    vote,
    alreadyVoted: ballot.rows.length > 0,
    myAnswer: ballot.rows[0]?.answer ?? null,
    nextVoteId: next.rows[0]?.id ?? null,
  };
}

export interface MeetingInput {
  title: string;
  department: string;
  meetingDate: string;
  participantEmails: string[];
  votingEnabled: boolean;
  questions: string[];
}

export async function createMeeting(input: MeetingInput, owner: { sub: string; email: string; name: string }): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const meeting = await client.query<{ id: number }>(
      `INSERT INTO meetings (title, department, meeting_date, owner_sub, owner_email, owner_name, voting_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.title, input.department, input.meetingDate, owner.sub, owner.email, owner.name, input.votingEnabled],
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
      const params: unknown[] = [];
      const tuples = input.questions
        .map((q, i) => {
          const base = i * 3;
          params.push(meetingId, q, i);
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        })
        .join(", ");
      await client.query(`INSERT INTO votes (meeting_id, question, position) VALUES ${tuples}`, params);
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE meetings
          SET title = $1, department = $2, meeting_date = $3, voting_enabled = $4
        WHERE id = $5`,
      [input.title, input.department, input.meetingDate, input.votingEnabled, id],
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

    // 表決題目重設（已投的票會跟著題目被刪除，這是預期行為）。
    await client.query(`DELETE FROM votes WHERE meeting_id = $1`, [id]);
    if (input.votingEnabled && input.questions.length > 0) {
      const params: unknown[] = [];
      const tuples = input.questions
        .map((q, i) => {
          const base = i * 3;
          params.push(id, q, i);
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        })
        .join(", ");
      await client.query(`INSERT INTO votes (meeting_id, question, position) VALUES ${tuples}`, params);
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

export async function submitBallot(voteId: number, voterEmail: string, answer: boolean): Promise<"ok" | "duplicate"> {
  const { rowCount } = await query(
    `INSERT INTO ballots (vote_id, voter_email, answer)
     VALUES ($1, $2, $3)
     ON CONFLICT (vote_id, voter_email) DO NOTHING`,
    [voteId, voterEmail, answer],
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
