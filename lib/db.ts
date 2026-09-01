import "server-only";
import { Pool } from "pg";
import { serviceConfig } from "@/config/service";

// 單一連線池，全站共用。連線字串必填（config/service.ts 缺了會直接 throw）。
// timezone 以 startup parameter 在連線時設定，避免 connect handler 多發一筆
// SET timezone 查詢而觸發 pg 的 DeprecationWarning（「client 已在執行查詢」）。
//
// C-1 / H-1：連線池調校——
//   1. max 由 10 調到 25：getMeetingDetail 已併成 3 條查詢（單一 request 不再同時吃 7 條連線），
//      但多人同時在線時 10 條仍太低。
//   2. connectionTimeoutMillis / query_timeout / statement_timeout：依賴變慢時要有明確上限，
//      而不是「無限排隊」把 request 全部卡在 pool 上拖垮整台服務。
const pool = new Pool({
  connectionString: serviceConfig.postgresUrl,
  max: 25,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout: 10_000,
  options: "-c timezone=Asia/Taipei -c statement_timeout=10000",
});

let initPromise: Promise<void> | null = null;

// 冪等的 schema 初始化：重複執行不會出錯，也不會清除既有資料。
// 記住「進行中／已完成」的 Promise 而不是布林旗標：
//   1. 併發的第一批查詢會等同一個 Promise，不會有人在表建好前就跑。
//   2. 初始化失敗（例如資料庫還沒建好）就清掉，下一個 request 會重試，
//      不會把整個 process 卡在「以為建好了」的狀態。
export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = createSchema().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function createSchema(): Promise<void> {
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
    -- 名字：邀請時只有 email，對方簽到／投票時用 JWT 的 name 回填
    ALTER TABLE participants ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
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
    -- 結算快照（停止表決時寫入）：事後名單變動不影響結果；NULL＝未結算或舊資料
    ALTER TABLE motions ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
    ALTER TABLE motions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
    ALTER TABLE motions ADD COLUMN IF NOT EXISTS present_count INTEGER;
    ALTER TABLE motions ADD COLUMN IF NOT EXISTS expected_count INTEGER;
    -- 'passed' | 'rejected' | 'no_quorum'
    ALTER TABLE motions ADD COLUMN IF NOT EXISTS result TEXT;

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
    ALTER TABLE ballots ADD COLUMN IF NOT EXISTS voter_name TEXT NOT NULL DEFAULT '';

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
    ALTER TABLE meeting_editors ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

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

    -- LOGIC-001：移除既有重複通知，並建立 UNIQUE(meeting_id, email)，使
    -- enqueueMeetingNotification 的 ON CONFLICT DO NOTHING 生效，避免重複發布重複寄信。
    DELETE FROM notification_queue a
      USING notification_queue b
     WHERE a.id > b.id
       AND a.meeting_id = b.meeting_id
       AND a.email = b.email;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_queue_meeting_email_key') THEN
        ALTER TABLE notification_queue ADD CONSTRAINT notification_queue_meeting_email_key UNIQUE (meeting_id, email);
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS api_keys (
      id           SERIAL PRIMARY KEY,
      label        TEXT NOT NULL,
      key_hash     TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ
    );

    -- 部會清單：由 /panel 管理。env DEPARTMENTS 只在這張表是空的時候當一次性種子。
    CREATE TABLE IF NOT EXISTS departments (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 50),
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await seedDepartments();
}

// 舊部署把部會放在 env DEPARTMENTS。表是空的就搬進來一次；之後以 DB 為準，
// 管理員刪掉的部會不會因為 env 還列著而在重啟時復活。
async function seedDepartments(): Promise<void> {
  if (serviceConfig.departments.length === 0) return;
  const { rows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM departments`);
  if ((rows[0]?.n ?? 0) > 0) return;
  for (const [i, name] of serviceConfig.departments.entries()) {
    await pool.query(`INSERT INTO departments (name, position) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, [name, i + 1]);
  }
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
