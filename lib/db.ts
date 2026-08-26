import "server-only";
import { Pool } from "pg";

// 單一連線池，全站共用。環境變數缺省時使用本機開發預設值。
const pool = new Pool({
  connectionString:
    process.env.POSTGRES_URL || "postgresql://t_meeting@127.0.0.1:5432/t_meeting",
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("connect", (client) => {
  client.query("SET timezone TO 'Asia/Taipei'").catch(() => {});
});

let initialized = false;

// 冪等的 schema 初始化：重複執行不會出錯，也不會清除既有資料。
export async function initDb(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
      department    TEXT NOT NULL DEFAULT '',
      meeting_date  DATE NOT NULL,
      owner_sub     TEXT NOT NULL,
      owner_email   TEXT NOT NULL,
      owner_name    TEXT NOT NULL,
      voting_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings (meeting_date DESC, id DESC);

    CREATE TABLE IF NOT EXISTS participants (
      id           SERIAL PRIMARY KEY,
      meeting_id   INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      email        TEXT NOT NULL,
      checked_in   BOOLEAN NOT NULL DEFAULT FALSE,
      checked_in_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (meeting_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_participants_meeting ON participants (meeting_id);

    CREATE TABLE IF NOT EXISTS votes (
      id          SERIAL PRIMARY KEY,
      meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      question    TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_votes_meeting ON votes (meeting_id, position);

    CREATE TABLE IF NOT EXISTS ballots (
      id          SERIAL PRIMARY KEY,
      vote_id     INTEGER NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
      voter_email TEXT NOT NULL,
      answer      BOOLEAN NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (vote_id, voter_email)
    );
    CREATE INDEX IF NOT EXISTS idx_ballots_vote ON ballots (vote_id);

    CREATE TABLE IF NOT EXISTS meeting_notes (
      id           SERIAL PRIMARY KEY,
      meeting_id   INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      author_email TEXT NOT NULL,
      author_name  TEXT NOT NULL,
      body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_notes_meeting ON meeting_notes (meeting_id, id DESC);
  `);
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  await initDb();
  const result = await pool.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export { pool };
