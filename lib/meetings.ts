import "server-only";
import type {
  agenda_attachments as AgendaAttachmentRow,
  agenda_items as AgendaItemRow,
  meeting_notes as MeetingNoteRow,
  meetings as MeetingRow,
  motions as MotionRow,
  participants as ParticipantRow,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { parseTaipeiLocal } from "@/lib/time";
import type { MotionResult } from "@/lib/threshold";
import { deleteAttachmentFile } from "@/lib/attachment-store";
import { fillNames } from "@/lib/name-map";

// ---- 對外形狀 ----
//
// 這些 interface 是呼叫端（頁面、API route、live-state）吃的形狀，欄位名跟 DB 一樣。
// 跟 Prisma 生成型別的差別只在「時間是 ISO 字串、meeting_date 是 YYYY-MM-DD、size 是 number」——
// pg 時代 timestamptz 也是回 Date、只是 interface 宣稱 string；現在由下面的 to*() 轉換函式把話說清楚，
// 跨 RSC / JSON 邊界的結果跟以前一模一樣。

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
  /** 後補欄位：v1 期間寫的紀錄是 NULL，判「作者本人」時要退回 email 比對。 */
  author_sub: string | null;
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

// ---- Prisma row → 對外形狀 ----

const iso = (d: Date): string => d.toISOString();
const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);
// @db.Date 讀出來是 UTC 午夜的 Date；取日期部分就是原本 `meeting_date::text` 的 YYYY-MM-DD。
export const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);
// 反向：YYYY-MM-DD → 寫進 @db.Date 用的 Date（UTC 午夜，只取日期）。
export const dateFromYmd = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

export function toMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    title: r.title,
    department: r.department,
    meeting_date: dateOnly(r.meeting_date),
    starts_at: iso(r.starts_at),
    owner_sub: r.owner_sub,
    owner_email: r.owner_email,
    owner_name: r.owner_name,
    voting_enabled: r.voting_enabled,
    location: r.location,
    online_link: r.online_link,
    description: r.description,
    status: r.status,
    current_agenda_item_id: r.current_agenda_item_id,
    created_at: iso(r.created_at),
  };
}

export function toParticipant(r: ParticipantRow): Participant {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    grade: r.grade,
    checked_in: r.checked_in,
    checked_in_at: isoOrNull(r.checked_in_at),
  };
}

export function toMotion(r: MotionRow): Motion {
  return {
    id: r.id,
    agenda_item_id: r.agenda_item_id,
    title: r.title,
    description: r.description,
    threshold: r.threshold,
    status: r.status as Motion["status"],
    position: r.position,
    created_at: iso(r.created_at),
    opened_at: isoOrNull(r.opened_at),
    closed_at: isoOrNull(r.closed_at),
    present_count: r.present_count,
    expected_count: r.expected_count,
    result: r.result as MotionResult | null,
  };
}

export function toAgendaItem(r: AgendaItemRow): AgendaItem {
  return {
    id: r.id,
    meeting_id: r.meeting_id,
    position: r.position,
    title: r.title,
    description: r.description,
    created_at: iso(r.created_at),
  };
}

export function toAttachment(r: AgendaAttachmentRow): AgendaAttachment {
  return {
    id: r.id,
    agenda_item_id: r.agenda_item_id,
    filename: r.filename,
    mime: r.mime,
    size: Number(r.size),
    storage_path: r.storage_path,
    uploaded_at: iso(r.uploaded_at),
  };
}

export function toNote(r: MeetingNoteRow): MeetingNote {
  return {
    id: r.id,
    author_email: r.author_email,
    author_name: r.author_name,
    author_sub: r.author_sub,
    body: r.body,
    created_at: iso(r.created_at),
  };
}

// ---- 列表 ----

const listOrder = [{ meeting_date: "desc" }, { id: "desc" }] as const;

// 每場會議的已簽到人數（列表頁用）；一次 GROUP BY，不是每場各打一槍。
async function checkedCounts(meetingIds: number[]): Promise<Map<number, number>> {
  if (meetingIds.length === 0) return new Map();
  const rows = await prisma.participants.groupBy({
    by: ["meeting_id"],
    where: { meeting_id: { in: meetingIds }, checked_in: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.meeting_id, r._count._all]));
}

async function toListItems(
  rows: (MeetingRow & { _count: { participants: number } })[],
): Promise<MeetingListItem[]> {
  const checked = await checkedCounts(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...toMeeting(r),
    participant_count: r._count.participants,
    checked_count: checked.get(r.id) ?? 0,
  }));
}

export async function listMeetings(): Promise<MeetingListItem[]> {
  const rows = await prisma.meetings.findMany({
    include: { _count: { select: { participants: true } } },
    orderBy: [...listOrder],
  });
  return toListItems(rows);
}

// 一般學生（default）能看到自己受邀的會議，且只能看到這些。
export async function listMyMeetings(email: string): Promise<MeetingListItem[]> {
  const rows = await prisma.meetings.findMany({
    where: { participants: { some: { email: email.toLowerCase() } } },
    include: { _count: { select: { participants: true } } },
    orderBy: [...listOrder],
  });
  return toListItems(rows);
}

export async function getMeeting(id: number): Promise<Meeting | null> {
  const row = await prisma.meetings.findUnique({ where: { id } });
  return row ? toMeeting(row) : null;
}

export async function countMeetings(): Promise<number> {
  return prisma.meetings.count();
}

export async function getMeetingDetail(id: number): Promise<MeetingDetail | null> {
  // C-1：三段查詢——會議＋參與人＋紀錄、議程＋附件、表決案＋票數——單一 request 最多佔 1–2 條連線。
  const [row, aRows, mRows] = await Promise.all([
    prisma.meetings.findUnique({
      where: { id },
      include: {
        participants: { orderBy: [{ checked_in: "desc" }, { email: "asc" }] },
        meeting_notes: { orderBy: { id: "desc" } },
      },
    }),
    prisma.agenda_items.findMany({
      where: { meeting_id: id },
      include: { agenda_attachments: { orderBy: { id: "asc" } } },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    prisma.motions.findMany({
      where: { agenda_items: { meeting_id: id } },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
  ]);
  if (!row) return null;

  const meeting = toMeeting(row);
  // 名字三層退回：DB name（登入回填）→ name-map.csv 對照表 → 空字串（顯示層再退回 email）
  const participants = await fillNames(row.participants.map(toParticipant));
  const notes = row.meeting_notes.map(toNote);

  // 票數：一次 GROUP BY 掃完這場所有案的票
  const tallies = mRows.length
    ? await prisma.ballots.groupBy({
        by: ["motion_id", "vote_status"],
        where: { motion_id: { in: mRows.map((m) => m.id) } },
        _count: { _all: true },
      })
    : [];
  const countOf = (motionId: number, status: VoteStatus) =>
    tallies.find((t) => t.motion_id === motionId && t.vote_status === status)?._count._all ?? 0;

  const motionByItem = new Map<number, MotionWithCount[]>();
  for (const m of mRows) {
    const list = motionByItem.get(m.agenda_item_id) ?? [];
    list.push({ ...toMotion(m), agree: countOf(m.id, "agree"), against: countOf(m.id, "against") });
    motionByItem.set(m.agenda_item_id, list);
  }

  const agenda: AgendaItemFull[] = aRows.map((a) => ({
    ...toAgendaItem(a),
    motions: motionByItem.get(a.id) ?? [],
    attachments: a.agenda_attachments.map(toAttachment),
  }));

  // current = null 就是「簽到階段」（會議一開始先簽到，主席按「下一案」才進議程 1）。
  // 不再退回第一個議程；只有某案 open 了才強制跟到那個議程。
  const current =
    agenda.find((a) => a.id === meeting.current_agenda_item_id) ??
    agenda.find((a) => a.motions.some((m) => m.status === "open")) ??
    null;

  return { meeting, participants, agenda, current, notes };
}

export async function isParticipant(meetingId: number, email: string): Promise<boolean> {
  const row = await prisma.participants.findUnique({
    where: { meeting_id_email: { meeting_id: meetingId, email: email.toLowerCase() } },
    select: { id: true },
  });
  return row !== null;
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
  const row = await prisma.participants.findUnique({
    where: { meeting_id_email: { meeting_id: meetingId, email: email.toLowerCase() } },
    select: { checked_in: true },
  });
  return row?.checked_in ?? false;
}

export async function setCheckIn(meetingId: number, email: string): Promise<"ok" | "already" | "not-invited"> {
  // 只動「還沒簽到」的列，簽到時間就是這一刻（沒有簽退功能，checked_in=false 的列 checked_in_at 一定是空的）。
  const { count } = await prisma.participants.updateMany({
    where: { meeting_id: meetingId, email: email.toLowerCase(), checked_in: false },
    data: { checked_in: true, checked_in_at: new Date() },
  });
  if (count > 0) return "ok";
  const invited = await isParticipant(meetingId, email);
  return invited ? "already" : "not-invited";
}

// 名字回填：邀請時只知道 email，對方用 Google 登入來簽到／投票時把 JWT 的 name 寫回去。
export async function rememberParticipantName(meetingId: number, email: string, name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  await prisma.participants.updateMany({
    where: { meeting_id: meetingId, email: email.toLowerCase(), NOT: { name: n } },
    data: { name: n },
  });
}

export async function rememberEditorName(meetingId: number, email: string, name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  await prisma.meeting_editors.updateMany({
    where: { meeting_id: meetingId, email: email.toLowerCase(), NOT: { name: n } },
    data: { name: n },
  });
}

export async function addNote(
  meetingId: number,
  author: { sub?: string; email: string; name: string },
  body: string,
): Promise<void> {
  await prisma.meeting_notes.create({
    data: { meeting_id: meetingId, author_email: author.email, author_name: author.name, author_sub: author.sub ?? null, body },
  });
}

// 單則紀錄的擁有者資訊——刪除前用來判權限（不需要 body，別把 5000 字撈進來）。
export async function getNoteOwner(
  noteId: number,
): Promise<{ id: number; meeting_id: number; author_sub: string | null; author_email: string } | null> {
  return prisma.meeting_notes.findUnique({
    where: { id: noteId },
    select: { id: true, meeting_id: true, author_sub: true, author_email: true },
  });
}

export async function deleteNote(noteId: number): Promise<boolean> {
  const { count } = await prisma.meeting_notes.deleteMany({ where: { id: noteId } });
  return count > 0;
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
  const row = await prisma.meeting_editors.findUnique({
    where: { meeting_id_email: { meeting_id: meetingId, email: email.toLowerCase() } },
    select: { id: true },
  });
  return row !== null;
}

// 授權某人成為該會議的「可寫記錄」協作者（冪等）。
export async function addMeetingEditor(meetingId: number, email: string, grantedBy: string): Promise<void> {
  await prisma.meeting_editors.createMany({
    data: [{ meeting_id: meetingId, email: email.toLowerCase(), granted_by: grantedBy }],
    skipDuplicates: true,
  });
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

function splitStartsAt(startsAt: string): { meetingDate: Date; startsAtDate: Date } {
  return { meetingDate: dateFromYmd(startsAt.slice(0, 10)), startsAtDate: parseTaipeiLocal(startsAt) };
}

export async function createMeeting(input: MeetingInput, owner: { sub: string; email: string; name: string }): Promise<number> {
  const { meetingDate, startsAtDate } = splitStartsAt(input.startsAt);
  return prisma.$transaction(
    async (tx) => {
      const meeting = await tx.meetings.create({
        data: {
          title: input.title,
          department: input.department,
          meeting_date: meetingDate,
          starts_at: startsAtDate,
          owner_sub: owner.sub,
          owner_email: owner.email,
          owner_name: owner.name,
          location: input.location,
          online_link: input.onlineLink,
          description: input.description,
          status: "draft",
        },
        select: { id: true },
      });
      if (input.participantEmails.length > 0) {
        await tx.participants.createMany({
          data: input.participantEmails.map((email) => ({ meeting_id: meeting.id, email, grade: "" })),
        });
      }
      return meeting.id;
    },
    { timeout: 10_000 },
  );
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

  const { meetingDate, startsAtDate } = splitStartsAt(input.startsAt);
  await prisma.meetings.update({
    where: { id },
    data: {
      title: input.title,
      department: input.department,
      meeting_date: meetingDate,
      starts_at: startsAtDate,
      location: input.location,
      online_link: input.onlineLink,
      description: input.description,
    },
  });
  return true;
}

// 從名單移除一個人。只動 participants；他已投的票（ballots 以 email 記）不受影響。
// DINT-001：已簽到者保留出席紀錄，不可移除。
export async function removeParticipant(meetingId: number, email: string): Promise<"removed" | "not-found" | "checked-in"> {
  const key = { meeting_id: meetingId, email: email.toLowerCase() };
  const row = await prisma.participants.findUnique({ where: { meeting_id_email: key }, select: { checked_in: true } });
  if (!row) return "not-found";
  if (row.checked_in) return "checked-in";
  await prisma.participants.deleteMany({ where: key });
  return "removed";
}

export async function deleteMeeting(id: number, ownerSub: string, isAdmin: boolean): Promise<boolean> {
  const meeting = await getMeeting(id);
  if (!meeting) return false;
  if (!isAdmin && meeting.owner_sub !== ownerSub) return false;

  // 子表全部 ON DELETE CASCADE；只有附件的實體檔案要自己清（先撈路徑，DB 刪掉後就找不到了）。
  const files = await prisma.agenda_attachments.findMany({
    where: { agenda_items: { meeting_id: id } },
    select: { storage_path: true },
  });
  const { count } = await prisma.meetings.deleteMany({ where: { id } });
  if (count > 0) await removeAttachmentFiles(files.map((f) => f.storage_path));
  return count > 0;
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
  const rows = await prisma.meeting_editors.findMany({
    where: { meeting_id: meetingId },
    select: { email: true, name: true, granted_by: true },
    orderBy: { email: "asc" },
  });
  return fillNames(rows);
}
