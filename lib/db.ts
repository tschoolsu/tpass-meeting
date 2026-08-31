import "server-only";
import { Pool } from "pg";

// 單一連線池，全站共用。環境變數缺省時使用本機開發預設值。
// timezone 以 startup parameter 在連線時設定，避免 connect handler 多發一筆
// SET timezone 查詢而觸發 pg 的 DeprecationWarning（「client 已在執行查詢」）。
const pool = new Pool({
  connectionString:
    process.env.POSTGRES_URL || "postgresql://t_meeting@127.0.0.1:5432/t_meeting",
  max: 10,
  idleTimeoutMillis: 30_000,
  options: "-c timezone=Asia/Taipei",
});

let initialized = false;

// 冪等的 schema 初始化：重複執行不會出錯，也不會清除既有資料。
export async function initDb(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // 舊版 schema（votes／vote_questions／ballots 扁平投票）需先遷移成
  // 新版「議程 → 表決案(motion) → 具名票」結構，再建立乾淨的新表。
  await migrateLegacyVoteShape();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
      department    TEXT NOT NULL DEFAULT '',
      meeting_date  DATE NOT NULL,
      starts_at     TIMESTAMPTZ NOT NULL,
      owner_sub     TEXT NOT NULL,
      owner_email   TEXT NOT NULL,
      owner_name    TEXT NOT NULL,
      voting_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
    -- 會議補充資訊（需求：地點／線上連結／長文說明／狀態）
    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS online_link TEXT NOT NULL DEFAULT '';
    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
    -- 現行議程指標（需求：主席推進議程／大螢幕跟隨）
    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS current_agenda_item_id INTEGER;
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
    -- 年級標籤（需求：簽到／簽退／具名紀錄的年級篩選）
    ALTER TABLE participants ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_participants_meeting ON participants (meeting_id);

    -- 議程項目（需求：長文說明／可動態修正）
    CREATE TABLE IF NOT EXISTS agenda_items (
      id          SERIAL PRIMARY KEY,
      meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      position    INTEGER NOT NULL DEFAULT 0,
      title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
      description TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_agenda_meeting ON agenda_items (meeting_id, position);

    -- 議程附件（需求：提案 PDF、預算表等附件空間）
    CREATE TABLE IF NOT EXISTS agenda_attachments (
      id             SERIAL PRIMARY KEY,
      agenda_item_id INTEGER NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
      filename       TEXT NOT NULL,
      mime           TEXT NOT NULL DEFAULT 'application/octet-stream',
      size           BIGINT NOT NULL DEFAULT 0,
      storage_path   TEXT NOT NULL,
      uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_agenda ON agenda_attachments (agenda_item_id);

    -- 表決案（取代舊 vote_questions）：一對多掛在議程下，各自獨立門檻與狀態。
    CREATE TABLE IF NOT EXISTS motions (
      id            SERIAL PRIMARY KEY,
      agenda_item_id INTEGER NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
      title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
      description   TEXT NOT NULL DEFAULT '',
      -- 可決門檻標籤（需求）：例如 '1/2+1/2'（出席 1/2 且簡單多數）、'2/3+1/2'、'2/3+2/3'、'3/4'
      threshold     TEXT NOT NULL DEFAULT '1/2+1/2',
      -- '' = 尚未開放；'open' = 表決進行中；'closed' = 已停止並結算
      status        TEXT NOT NULL DEFAULT '',
      position      INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_motions_agenda ON motions (agenda_item_id, position);

    -- 具名票（需求：同意／不同意／未投票，公開透明）
    CREATE TABLE IF NOT EXISTS ballots (
      id          SERIAL PRIMARY KEY,
      motion_id   INTEGER NOT NULL REFERENCES motions(id) ON DELETE CASCADE,
      voter_email TEXT NOT NULL,
      -- 'agree' | 'against'
      vote_status TEXT NOT NULL CHECK (vote_status IN ('agree', 'against')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (motion_id, voter_email)
    );
    CREATE INDEX IF NOT EXISTS idx_ballots_motion ON ballots (motion_id);

    CREATE TABLE IF NOT EXISTS meeting_notes (
      id           SERIAL PRIMARY KEY,
      meeting_id   INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      author_email TEXT NOT NULL,
      author_name  TEXT NOT NULL,
      body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_notes_meeting ON meeting_notes (meeting_id, id DESC);
    -- 記錄建立者的 sub（需求：僅創建者／被授權成員可新增、編輯會議記錄）
    ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS author_sub TEXT;

    -- 會議記錄「被授權可寫入」的協作者（需求：Creator + Authorized Member 才可新增記錄）
    CREATE TABLE IF NOT EXISTS meeting_editors (
      id          SERIAL PRIMARY KEY,
      meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      granted_by  TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (meeting_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_meeting_editors_meeting ON meeting_editors (meeting_id, email);

    -- Email 通知佇列（需求：自動寄送會議通知；支援失敗重試）
    CREATE TABLE IF NOT EXISTS notification_queue (
      id             SERIAL PRIMARY KEY,
      meeting_id     INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      email          TEXT NOT NULL,
      subject        TEXT NOT NULL,
      body           TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending',
      attempts       INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at        TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
      ON notification_queue (status, next_attempt_at);

    CREATE TABLE IF NOT EXISTS api_keys (
      id           SERIAL PRIMARY KEY,
      label        TEXT NOT NULL,
      key_hash     TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ
    );
  `);
}

// 資料安全遷移：舊版扁平投票結構（votes → vote_questions → ballots）與新版
// agenda_items → motions → ballots 結構不相容。本系統仍在開發階段，舊投票資料
// 價值有限，故直接重建乾淨的新表（meetings／participants／notes 保留）。
async function migrateLegacyVoteShape(): Promise<void> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'vote_questions'
     ) AS exists`,
  );
  if (!rows[0]?.exists) return;
  await pool.query("DROP TABLE IF EXISTS ballots, vote_questions, votes CASCADE");
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
