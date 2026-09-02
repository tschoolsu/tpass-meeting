-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "agenda_attachments" (
    "id" SERIAL NOT NULL,
    "agenda_item_id" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" BIGINT NOT NULL DEFAULT 0,
    "storage_path" TEXT NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_items" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ballots" (
    "id" SERIAL NOT NULL,
    "motion_id" INTEGER NOT NULL,
    "voter_email" TEXT NOT NULL,
    "vote_status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voter_name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_editors" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "meeting_editors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_notes" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "author_email" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author_sub" TEXT,

    CONSTRAINT "meeting_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT '',
    "meeting_date" DATE NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "owner_sub" TEXT NOT NULL,
    "owner_email" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "voting_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT NOT NULL DEFAULT '',
    "online_link" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "current_agenda_item_id" INTEGER,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motions" (
    "id" SERIAL NOT NULL,
    "agenda_item_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "threshold" TEXT NOT NULL DEFAULT '1/2+1/2',
    "status" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "present_count" INTEGER,
    "expected_count" INTEGER,
    "result" TEXT,

    CONSTRAINT "motions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_queue" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "checked_in" BOOLEAN NOT NULL DEFAULT false,
    "checked_in_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_attachments_agenda" ON "agenda_attachments"("agenda_item_id");

-- CreateIndex
CREATE INDEX "idx_agenda_meeting" ON "agenda_items"("meeting_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "idx_ballots_motion" ON "ballots"("motion_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballots_motion_id_voter_email_key" ON "ballots"("motion_id", "voter_email");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "idx_meeting_editors_meeting" ON "meeting_editors"("meeting_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_editors_meeting_id_email_key" ON "meeting_editors"("meeting_id", "email");

-- CreateIndex
CREATE INDEX "idx_notes_meeting" ON "meeting_notes"("meeting_id", "id" DESC);

-- CreateIndex
CREATE INDEX "idx_meetings_date" ON "meetings"("meeting_date" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_motions_agenda" ON "motions"("agenda_item_id", "position");

-- CreateIndex
CREATE INDEX "idx_notification_queue_pending" ON "notification_queue"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_queue_meeting_email_key" ON "notification_queue"("meeting_id", "email");

-- CreateIndex
CREATE INDEX "idx_participants_meeting" ON "participants"("meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "participants_meeting_id_email_key" ON "participants"("meeting_id", "email");

-- AddForeignKey
ALTER TABLE "agenda_attachments" ADD CONSTRAINT "agenda_attachments_agenda_item_id_fkey" FOREIGN KEY ("agenda_item_id") REFERENCES "agenda_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_motion_id_fkey" FOREIGN KEY ("motion_id") REFERENCES "motions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "meeting_editors" ADD CONSTRAINT "meeting_editors_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "motions" ADD CONSTRAINT "motions_agenda_item_id_fkey" FOREIGN KEY ("agenda_item_id") REFERENCES "agenda_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- CHECK constraints（Prisma 表達不了，手動保留；名稱與 lib/db.ts 時代 PostgreSQL 自動命名的一致，
-- 這樣既有庫 `migrate resolve --applied 0_init` 之後 pg_constraint 跟這份 SQL 才對得上）
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_title_check" CHECK (char_length(title) BETWEEN 1 AND 200);
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_title_check" CHECK (char_length(title) BETWEEN 1 AND 200);
ALTER TABLE "motions" ADD CONSTRAINT "motions_title_check" CHECK (char_length(title) BETWEEN 1 AND 500);
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_vote_status_check" CHECK (vote_status IN ('agree', 'against'));
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_body_check" CHECK (char_length(body) BETWEEN 1 AND 5000);
ALTER TABLE "departments" ADD CONSTRAINT "departments_name_check" CHECK (char_length(name) BETWEEN 1 AND 50);
