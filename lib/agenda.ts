import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { Motion, MotionWithCount, VoteStatus } from "@/lib/meetings";
import { getMeeting, removeAttachmentFiles, toMotion } from "@/lib/meetings";
import { fillNames } from "@/lib/name-map";
import { evaluateMotion, motionOutcome, THRESHOLD_LABEL, type MotionEvaluation, type MotionOutcome } from "@/lib/threshold";

// 可決門檻的合法值：規則與標籤在 lib/threshold.ts。
export const VALID_THRESHOLDS: ReadonlySet<string> = new Set(Object.keys(THRESHOLD_LABEL));

// 多步驟寫入一律包 interactive transaction，並給明確逾時（準則第 4 條）。
const TX = { timeout: 10_000 } as const;

export interface AgendaInput {
  title: string;
  description: string;
}

// ---- 議程項目 CRUD（需求：會議中尚未表決前可動態新增/修改/刪除） ----

export async function addAgendaItem(meetingId: number, input: AgendaInput): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const max = await tx.agenda_items.aggregate({ _max: { position: true }, where: { meeting_id: meetingId } });
    const row = await tx.agenda_items.create({
      data: {
        meeting_id: meetingId,
        position: max._max.position === null ? 0 : max._max.position + 1,
        title: input.title.trim(),
        description: input.description.trim(),
      },
      select: { id: true },
    });
    return row.id;
  }, TX);
}

export async function updateAgendaItem(meetingId: number, id: number, input: AgendaInput): Promise<boolean> {
  const { count } = await prisma.agenda_items.updateMany({
    where: { id, meeting_id: meetingId },
    data: { title: input.title.trim(), description: input.description.trim() },
  });
  return count > 0;
}

export async function deleteAgendaItem(meetingId: number, id: number): Promise<boolean> {
  const files = await prisma.agenda_attachments.findMany({
    where: { agenda_item_id: id, agenda_items: { meeting_id: meetingId } },
    select: { storage_path: true },
  });
  const { count } = await prisma.agenda_items.deleteMany({ where: { id, meeting_id: meetingId } });
  if (count > 0) await removeAttachmentFiles(files.map((f) => f.storage_path));
  return count > 0;
}

export async function moveAgendaItem(id: number, dir: "up" | "down", meetingId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const items = await tx.agenda_items.findMany({
      where: { meeting_id: meetingId },
      select: { id: true, position: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    const idx = items.findIndex((r) => r.id === id);
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    await tx.agenda_items.update({ where: { id: b.id }, data: { position: a.position } });
    await tx.agenda_items.update({ where: { id: a.id }, data: { position: b.position } });
  }, TX);
}

// ---- 表決案（motion）CRUD ----

export interface MotionInput {
  title: string;
  description: string;
  threshold: string;
}

// 僅在該議程屬於指定會議（meetingId）時才允許新增，回傳 0 代表議程不存在或未授權。
export async function addMotion(meetingId: number, agendaItemId: number, input: MotionInput): Promise<number> {
  if (!VALID_THRESHOLDS.has(input.threshold)) throw new Error("門檻設定不合法");
  return prisma.$transaction(async (tx) => {
    const item = await tx.agenda_items.findFirst({ where: { id: agendaItemId, meeting_id: meetingId }, select: { id: true } });
    if (!item) return 0;
    const max = await tx.motions.aggregate({ _max: { position: true }, where: { agenda_item_id: agendaItemId } });
    const row = await tx.motions.create({
      data: {
        agenda_item_id: agendaItemId,
        title: input.title.trim(),
        description: input.description.trim(),
        threshold: input.threshold,
        status: "",
        position: max._max.position === null ? 0 : max._max.position + 1,
      },
      select: { id: true },
    });
    return row.id;
  }, TX);
}

// 某案的狀態，且只認屬於 meetingId 的案（SEC-002）；不存在回 null。
async function motionStatusIn(meetingId: number, id: number): Promise<string | null> {
  const row = await prisma.motions.findFirst({
    where: { id, agenda_items: { meeting_id: meetingId } },
    select: { status: true },
  });
  return row?.status ?? null;
}

// 動態修正：僅在「尚未開始表決」（status 不是 open 或 closed）且屬於指定會議時允許。
export async function updateMotion(meetingId: number, id: number, input: MotionInput): Promise<boolean> {
  const status = await motionStatusIn(meetingId, id);
  if (status === null) return false;
  if (status === "open" || status === "closed") return false; // 已開始/已結算不可改
  if (!VALID_THRESHOLDS.has(input.threshold)) return false;

  const { count } = await prisma.motions.updateMany({
    where: { id, agenda_items: { meeting_id: meetingId } },
    data: { title: input.title.trim(), description: input.description.trim(), threshold: input.threshold },
  });
  return count > 0;
}

export async function deleteMotion(meetingId: number, id: number): Promise<boolean> {
  const status = await motionStatusIn(meetingId, id);
  if (status === null) return false;
  if (status === "open" || status === "closed") return false;
  const { count } = await prisma.motions.deleteMany({ where: { id, agenda_items: { meeting_id: meetingId } } });
  return count > 0;
}

// ---- 主席控制（需求：推進議程／開始表決／停止並宣告結果） ----

// 指定某議程項目為「現行」；僅允許指向該會議自己的議程項目。null ＝ 回到簽到階段。
export async function setCurrentAgendaItem(meetingId: number, agendaItemId: number | null): Promise<boolean> {
  if (agendaItemId !== null) {
    const item = await prisma.agenda_items.findFirst({ where: { id: agendaItemId, meeting_id: meetingId }, select: { id: true } });
    if (!item) return false;
  }
  const { count } = await prisma.meetings.updateMany({ where: { id: meetingId }, data: { current_agenda_item_id: agendaItemId } });
  return count > 0;
}

// 把現行議程往前／往後移一筆；到頭時回傳 false（不循環）。沒設現行時「下一案」從第一筆開始。
async function stepAgendaItem(meetingId: number, dir: 1 | -1): Promise<boolean> {
  const rows = await prisma.agenda_items.findMany({
    where: { meeting_id: meetingId },
    select: { id: true, position: true },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  if (rows.length === 0) return false;
  const m = await prisma.meetings.findUnique({ where: { id: meetingId }, select: { current_agenda_item_id: true } });
  const currentId = m?.current_agenda_item_id ?? null;
  const idx = rows.findIndex((r) => r.id === currentId);
  // idx = -1 就是簽到階段：下一案進議程 1；從議程 1 按上一案回到簽到（target = -1）。
  const target = idx < 0 ? (dir === 1 ? 0 : -2) : idx + dir;
  if (target < -1 || target >= rows.length) return false;
  await prisma.meetings.update({ where: { id: meetingId }, data: { current_agenda_item_id: target < 0 ? null : rows[target].id } });
  return true;
}

export const nextAgendaItem = (meetingId: number) => stepAgendaItem(meetingId, 1);
export const prevAgendaItem = (meetingId: number) => stepAgendaItem(meetingId, -1);

// 結算一案（同一 transaction 內）：鎖列、以「當下」的已簽到／應到與票數判定，寫回快照。
// 只結算屬於 meetingId 且 open 的案（SEC-002）；否則回 null。
async function settleMotion(tx: Prisma.TransactionClient, meetingId: number, motionId: number): Promise<MotionEvaluation | null> {
  // FOR UPDATE 鎖住這一列：兩個主席同時按「停止」不會結算兩次；同一 interactive transaction 內的查詢都在同一條連線上，鎖有效。
  await tx.$queryRaw`SELECT id FROM motions WHERE id = ${motionId} FOR UPDATE`;
  const m = await tx.motions.findFirst({
    where: { id: motionId, agenda_items: { meeting_id: meetingId } },
    select: { threshold: true, status: true, agenda_items: { select: { meeting_id: true } } },
  });
  if (!m || m.status !== "open") return null;
  const mid = m.agenda_items.meeting_id;

  const [expected, present, agree, against] = await Promise.all([
    tx.participants.count({ where: { meeting_id: mid } }),
    tx.participants.count({ where: { meeting_id: mid, checked_in: true } }),
    tx.ballots.count({ where: { motion_id: motionId, vote_status: "agree" } }),
    tx.ballots.count({ where: { motion_id: motionId, vote_status: "against" } }),
  ]);
  const ev = evaluateMotion({ threshold: m.threshold, agree, against, present });
  await tx.motions.update({
    where: { id: motionId },
    data: { status: "closed", closed_at: new Date(), present_count: present, expected_count: expected, result: ev.result },
  });
  return ev;
}

// 開啟表決：同會議其他進行中的案先結算（全站假設同時只有一個 open 案），再把這案設為 open。
// 已結算的案不能重開（結果已定），回 "already-closed"。只動屬於 meetingId 的案（SEC-002）。
export async function startVote(meetingId: number, motionId: number): Promise<"ok" | "not-found" | "already-closed"> {
  const target = await prisma.motions.findFirst({
    where: { id: motionId, agenda_items: { meeting_id: meetingId } },
    select: { status: true, agenda_items: { select: { meeting_id: true } } },
  });
  if (!target) return "not-found";
  if (target.status === "closed") return "already-closed";
  if (target.status === "open") return "ok";
  const mid = target.agenda_items.meeting_id;

  return prisma.$transaction(async (tx) => {
    const open = await tx.motions.findMany({ where: { status: "open", agenda_items: { meeting_id: mid } }, select: { id: true } });
    for (const o of open) await settleMotion(tx, mid, o.id);
    const { count } = await tx.motions.updateMany({ where: { id: motionId, status: "" }, data: { status: "open", opened_at: new Date() } });
    if (count > 0) return "ok";
    // 樂觀鎖沒中：狀態在最初檢查之後、這裡更新之前被別的呼叫改掉了，回頭看現在是什麼狀態再回報。
    const cur = await tx.motions.findUnique({ where: { id: motionId }, select: { status: true } });
    return cur?.status === "closed" ? "already-closed" : "ok";
  }, TX);
}

// 停止表決並結算（寫入出席快照與結果）；只動屬於 meetingId 的案。不是 open 回 null。
export async function stopVote(meetingId: number, motionId: number): Promise<MotionEvaluation | null> {
  return prisma.$transaction((tx) => settleMotion(tx, meetingId, motionId), TX);
}

export async function getMotion(motionId: number): Promise<Motion | null> {
  const row = await prisma.motions.findUnique({ where: { id: motionId } });
  return row ? toMotion(row) : null;
}

export interface MotionFlow {
  meeting: { id: number; title: string; starts_at: string; voting_enabled: boolean };
  motion: MotionWithCount;
  answered: VoteStatus | null;
  isOpen: boolean;
  canStart: boolean; // 會議已開始（時間到）
}

// 某案各選項的票數。
async function tallyMotion(motionId: number): Promise<{ agree: number; against: number }> {
  const rows = await prisma.ballots.groupBy({ by: ["vote_status"], where: { motion_id: motionId }, _count: { _all: true } });
  const c = (s: VoteStatus) => rows.find((r) => r.vote_status === s)?._count._all ?? 0;
  return { agree: c("agree"), against: c("against") };
}

export async function getMotionFlow(motionId: number, email: string): Promise<MotionFlow | null> {
  const motion = await getMotion(motionId);
  if (!motion) return null;

  const meetingId = await getMeetingOfAgenda(motion.agenda_item_id);
  if (!meetingId) return null;
  const meeting = await getMeeting(meetingId);
  if (!meeting) return null;

  const [counts, mine] = await Promise.all([
    tallyMotion(motion.id),
    prisma.ballots.findUnique({
      where: { motion_id_voter_email: { motion_id: motion.id, voter_email: email } },
      select: { vote_status: true },
    }),
  ]);

  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      starts_at: meeting.starts_at,
      voting_enabled: meeting.voting_enabled,
    },
    motion: { ...motion, ...counts },
    answered: (mine?.vote_status as VoteStatus | undefined) ?? null,
    isOpen: motion.status === "open",
    canStart: new Date(meeting.starts_at).getTime() <= Date.now(),
  };
}

// 我在這場會議投過的表決案 id（快照的 me.voted_motion_ids；彈窗靠它判斷「還沒投」）。
export async function listMyVotedMotionIds(meetingId: number, email: string): Promise<number[]> {
  const rows = await prisma.ballots.findMany({
    where: { voter_email: email.toLowerCase(), motions: { agenda_items: { meeting_id: meetingId } } },
    select: { motion_id: true },
  });
  return rows.map((r) => r.motion_id);
}

async function getMeetingOfAgenda(agendaItemId: number): Promise<number> {
  const row = await prisma.agenda_items.findUnique({ where: { id: agendaItemId }, select: { meeting_id: true } });
  return row?.meeting_id ?? 0;
}

export async function submitBallot(
  motionId: number,
  voter: { email: string; name: string },
  status: VoteStatus,
): Promise<"ok" | "duplicate" | "not-open" | "invalid"> {
  // ERR-002：防禦性校驗，避免非法投票選項觸發 DB CHECK 例外。
  if (status !== "agree" && status !== "against") return "invalid";
  return prisma.$transaction(async (tx) => {
    // FOR UPDATE 鎖住這一列，跟 settleMotion 用同一把鎖序列化：主席按「停止」結算的瞬間
    // 搶進來的票，會被擋在鎖外面等到結算那個 transaction 提交，再讀到 status 已經是
    // closed 而回 not-open，不會出現票寫進 ballots 但沒進結算快照的競態。
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM motions WHERE id = ${motionId} FOR UPDATE`;
    const motionStatus = rows[0]?.status;
    if (motionStatus === undefined || motionStatus !== "open") return "not-open"; // 不存在或未開放表決（需求）

    try {
      await tx.ballots.create({
        data: { motion_id: motionId, voter_email: voter.email.toLowerCase(), voter_name: voter.name.trim(), vote_status: status },
        select: { id: true },
      });
    } catch (err) {
      // P2002 = UNIQUE(motion_id, voter_email) 違反：同一人對同一案只能投一次
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicate";
      throw err;
    }
    return "ok";
  }, TX);
}

// ---- 附件（需求：議程附件空間） ----

// 僅在該議程屬於指定會議（meetingId）時才允許新增附件；回傳 0 代表未授權。
export async function addAttachment(
  meetingId: number,
  agendaItemId: number,
  info: { filename: string; mime: string; size: number; storage_path: string },
): Promise<number> {
  const item = await prisma.agenda_items.findFirst({ where: { id: agendaItemId, meeting_id: meetingId }, select: { id: true } });
  if (!item) return 0;
  const row = await prisma.agenda_attachments.create({
    data: { agenda_item_id: agendaItemId, filename: info.filename, mime: info.mime, size: info.size, storage_path: info.storage_path },
    select: { id: true },
  });
  return row.id;
}

export async function getAttachment(id: number): Promise<{ meeting_id: number; filename: string; mime: string; storage_path: string } | null> {
  const row = await prisma.agenda_attachments.findUnique({
    where: { id },
    select: { filename: true, mime: true, storage_path: true, agenda_items: { select: { meeting_id: true } } },
  });
  if (!row) return null;
  return { meeting_id: row.agenda_items.meeting_id, filename: row.filename, mime: row.mime, storage_path: row.storage_path };
}

// 具名表決統計（需求：公開透明 + 會議紀錄匯出）。回傳每種狀態的票數與全員名單。
export async function getMotionResults(motionId: number): Promise<{
  motion_id: number;
  title: string;
  threshold: string;
  status: string;
  agree: number;
  against: number;
  total: number;
  not_voted: number;
  present_count: number | null;
  expected_count: number | null;
  result: Motion["result"];
  /** 通過判定（open 用即時出席數，closed 用結算快照）；尚未開放為 null。 */
  outcome: MotionOutcome | null;
  ballots: { voter_email: string; voter_name: string; vote_status: VoteStatus }[];
} | null> {
  const motion = await getMotion(motionId);
  if (!motion) return null;
  const meetingId = await getMeetingOfAgenda(motion.agenda_item_id);

  const [bRows, pRows] = await Promise.all([
    prisma.ballots.findMany({
      where: { motion_id: motionId },
      select: { voter_email: true, voter_name: true, vote_status: true },
    }),
    prisma.participants.findMany({
      where: { meeting_id: meetingId },
      select: { email: true, name: true, checked_in: true },
      orderBy: { email: "asc" },
    }),
  ]);

  // 票上的名字空的就用 participants.name（登入回填）補；還是空的再用 name-map.csv 補
  const nameByEmail = new Map(pRows.map((p) => [p.email, p.name]));
  const raw = bRows
    .map((b) => ({ email: b.voter_email, name: b.voter_name || nameByEmail.get(b.voter_email) || "", vote_status: b.vote_status as VoteStatus }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  const ballots = (await fillNames(raw)).map((b) => ({ voter_email: b.email, voter_name: b.name, vote_status: b.vote_status }));
  const votedEmails = new Set(ballots.map((b) => b.voter_email));
  const notVoted = pRows.filter((p) => !votedEmails.has(p.email)).map((p) => p.email);
  const count = (s: VoteStatus) => ballots.filter((b) => b.vote_status === s).length;
  const agree = count("agree");
  const against = count("against");
  const live = { present: pRows.filter((p) => p.checked_in).length };

  return {
    motion_id: motion.id,
    title: motion.title,
    threshold: motion.threshold,
    status: motion.status,
    agree,
    against,
    total: ballots.length,
    not_voted: notVoted.length,
    present_count: motion.present_count,
    expected_count: motion.expected_count,
    result: motion.result,
    outcome: motionOutcome({ ...motion, agree, against }, live),
    ballots,
  };
}

// 整個會議的具名投票矩陣（需求 4：所有使用者皆可即時與事後查看）。
// 回傳每人（應出席學生）對每個表決案的投票狀態（含未投票）。
export interface MeetingBallotMatrix {
  meeting_id: number;
  participants: { email: string; name: string; grade: string; checked_in: boolean }[];
  motions: {
    id: number;
    title: string;
    threshold: string;
    status: string;
    position: number;
    agenda_title: string;
    agenda_position: number;
    present_count: number | null;
    expected_count: number | null;
    result: Motion["result"];
  }[];
  votes: Record<string, Record<string, VoteStatus>>; // participantEmail -> motionId -> status
  counts: Record<number, { agree: number; against: number }>;
}

export async function getMeetingBallots(meetingId: number): Promise<MeetingBallotMatrix | null> {
  const [pRows, mRows, bRows] = await Promise.all([
    prisma.participants.findMany({
      where: { meeting_id: meetingId },
      select: { email: true, name: true, grade: true, checked_in: true },
    }),
    prisma.motions.findMany({
      where: { agenda_items: { meeting_id: meetingId } },
      select: {
        id: true,
        title: true,
        threshold: true,
        status: true,
        position: true,
        present_count: true,
        expected_count: true,
        result: true,
        agenda_items: { select: { title: true, position: true } },
      },
      orderBy: [{ agenda_items: { position: "asc" } }, { position: "asc" }],
    }),
    prisma.ballots.findMany({
      where: { motions: { agenda_items: { meeting_id: meetingId } } },
      select: { motion_id: true, voter_email: true, vote_status: true },
    }),
  ]);

  // 原本 ORDER BY NULLIF(name, ''), email：有名字的先（按名字），沒名字的排最後（按 email）
  const participants = [...pRows].sort((a, b) => {
    if (!a.name !== !b.name) return a.name ? -1 : 1;
    return a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
  });

  const motions: MeetingBallotMatrix["motions"] = mRows.map((m) => ({
    id: m.id,
    title: m.title,
    threshold: m.threshold,
    status: m.status,
    position: m.position,
    agenda_title: m.agenda_items.title,
    agenda_position: m.agenda_items.position,
    present_count: m.present_count,
    expected_count: m.expected_count,
    result: m.result as Motion["result"],
  }));

  const votes: MeetingBallotMatrix["votes"] = {};
  const counts: MeetingBallotMatrix["counts"] = {};
  for (const m of motions) counts[m.id] = { agree: 0, against: 0 };

  for (const b of bRows) {
    const status = b.vote_status as VoteStatus;
    if (!votes[b.voter_email]) votes[b.voter_email] = {};
    votes[b.voter_email][String(b.motion_id)] = status;
    const c = counts[b.motion_id];
    if (c) c[status] += 1;
  }

  return {
    meeting_id: meetingId,
    participants: await fillNames(participants),
    motions,
    votes,
    counts,
  };
}
