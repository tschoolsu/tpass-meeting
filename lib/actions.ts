"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAdmin,
  requireAccess,
  requireAdmin,
  requireManager,
} from "@/lib/auth";
import { isStarted } from "@/lib/time";
import { canTransition } from "@/lib/meeting-status";
import { canDeleteNote } from "@/lib/note-permissions";
import { prisma } from "@/lib/db";
import { createApiKey, deleteApiKey } from "@/lib/api-keys";
import { importAll } from "@/lib/backup";
import { saveBgm, clearBgm, MAX_BGM_BYTES } from "@/lib/bgm";
import {
  addMeetingEditor,
  addNote,
  canWriteNotes,
  createMeeting,
  deleteMeeting,
  deleteNote,
  getMeeting,
  getCheckInState,
  getMeetingDetail,
  getNoteOwner,
  isParticipant,
  rememberEditorName,
  rememberParticipantName,
  removeParticipant,
  setCheckIn,
  updateMeeting,
  type MeetingInput,
  type VoteStatus,
} from "@/lib/meetings";
import {
  addAgendaItem,
  addMotion,
  addAttachment,
  deleteAgendaItem,
  deleteMotion,
  moveAgendaItem,
  nextAgendaItem,
  prevAgendaItem,
  setCurrentAgendaItem,
  startVote,
  stopVote,
  submitBallot,
  updateAgendaItem,
  updateMotion,
} from "@/lib/agenda";
import { notifyMeetingChanged } from "@/lib/stream";
import {
  saveAttachment,
  deleteAttachmentFile,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/attachment-store";
import { enqueueMeetingNotification } from "@/lib/email";
import { canStudentCreate } from "@/lib/permissions";
import { addDepartment, removeDepartment } from "@/lib/departments";
import { parseMeeting, ValidationError } from "@/lib/validation";

export interface FormState {
  error?: string;
}

/** 會議基本資料表單：建立會 redirect，編輯則回 saved 讓工作台就地收合。 */
export type MeetingFormState = FormState & { saved?: boolean };

export async function createMeetingAction(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const session = await requireAccess();
  const canCreate = canStudentCreate(session);
  if (!canCreate) return { error: "你沒有權限建立會議" };

  let input: MeetingInput;
  try {
    input = parseMeeting(formData);
  } catch (err) {
    return { error: err instanceof ValidationError ? err.message : "輸入資料不正確" };
  }

  const meetingId = await createMeeting(input, {
    sub: session.sub,
    email: session.email,
    name: session.name,
  });
  revalidatePath("/");
  // 建好直接進工作台：下一步（加名單、建議程）都在那裡。
  redirect(`/manage?id=${meetingId}`);
}

export async function updateMeetingAction(
  id: number,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const session = await requireManager();
  let input: MeetingInput;
  try {
    input = parseMeeting(formData);
  } catch (err) {
    return { error: err instanceof ValidationError ? err.message : "輸入資料不正確" };
  }

  const ok = await updateMeeting(id, input, session.sub, isAdmin(session));
  if (!ok) return { error: "你沒有權限編輯這份會議記錄" };
  revalidatePath("/");
  return { saved: true };
}

// 從名單移除一個人（工作台 ②）。這是唯一的移除路徑——貼錯 email 沒有它就改不回來。
export async function removeParticipantAction(meetingId: number, email: string): Promise<FormState> {
  const session = await requireManager();
  if (!(await canEditMeeting(meetingId, session))) return { error: "你沒有權限編輯這場會議的名單" };
  const result = await removeParticipant(meetingId, email);
  if (result === "not-found") return { error: "名單裡沒有這個人" };
  if (result === "checked-in") return { error: "此人已簽到，為保留出席紀錄不可移除" };
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

// 不在這裡 redirect：server action 內的 redirect 會讓 client 端的 promise 被 reject，
// ConfirmActionButton 永遠走不到成功分支；導頁交給 client（navigateTo）。
export async function deleteMeetingAction(id: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await deleteMeeting(id, session.sub, isAdmin(session));
  if (!ok) return { error: "你沒有權限刪除這份會議記錄" };
  revalidatePath("/");
  return {};
}

// 狀態轉移只有三種：發布（draft→published）、結束（→closed）、重新開啟（closed→published）。
// 通知信只在「第一次發布」寄——notification_queue 沒有 unique，重複 enqueue 就會重複寄，
// 防重靠這裡的 canTransition（同狀態不能再轉一次）與 from==="draft" 這個條件。
export async function setMeetingStatusAction(id: number, status: string): Promise<FormState> {
  const session = await requireManager();
  const meeting = await getMeeting(id);
  if (!meeting) return { error: "找不到會議" };
  if (!isAdmin(session) && meeting.owner_sub !== session.sub) return { error: "你沒有權限更新會議狀態" };
  if (!canTransition(meeting.status, status)) return { error: "這個狀態轉移不合法" };
  if (status === "closed" && (await hasOpenMotion(id))) return { error: "有表決進行中，請先在主席控制台停止" };

  // WHERE status = 舊狀態：兩個人同時按，只有一個會成功（樂觀鎖）
  const { count } = await prisma.meetings.updateMany({ where: { id, status: meeting.status }, data: { status } });
  if (count === 0) return { error: "狀態已被其他人更新，請重新整理" };

  if (meeting.status === "draft" && status === "published") {
    // 第一次發布才寄通知（需求 6）：只 enqueue，實際派送交給背景 worker（H-2）。
    // 不再同步 await dispatchPendingEmails()——SMTP 慢時那會把這個 server action 卡住數分鐘。
    await enqueueMeetingNotification(id);
  }
  await notifyMeetingChanged(id, "status");
  revalidatePath(`/read?id=${id}`);
  return {};
}

async function hasOpenMotion(meetingId: number): Promise<boolean> {
  const n = await prisma.motions.count({ where: { status: "open", agenda_items: { meeting_id: meetingId } } });
  return n > 0;
}

export async function checkInAction(meetingId: number): Promise<FormState & { done?: boolean }> {
  const session = await requireAccess();
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { error: "找不到會議" };
  if (meeting.status === "closed") return { error: "會議已結束，無法簽到" };
  if (!isStarted(meeting.starts_at)) return { error: "會議尚未開始，開始後才能簽到" };
  const invited = await isParticipant(meetingId, session.email);
  if (!invited) return { error: "你未被邀請參與這場會議" };
  const status = await setCheckIn(meetingId, session.email);
  if (status === "not-invited") return { error: "你未被邀請參與這場會議" };
  await rememberParticipantName(meetingId, session.email, session.name);
  await notifyMeetingChanged(meetingId, "checkin");
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/checkin?id=${meetingId}`);
  return { done: true };
}

// ---- 議程／議案（需求 2） ----

export async function addAgendaItemAction(meetingId: number, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  await addAgendaItem(meetingId, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function updateAgendaItemAction(agendaId: number, meetingId: number, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  await updateAgendaItem(meetingId, agendaId, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function deleteAgendaItemAction(agendaId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  const deleted = await deleteAgendaItem(meetingId, agendaId);
  if (!deleted) return { error: "議程項目不存在或未授權" };
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function moveAgendaItemAction(agendaId: number, dir: "up" | "down", meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  await moveAgendaItem(agendaId, dir, meetingId);
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function addMotionAction(agendaId: number, meetingId: number, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  try {
    const motionId = await addMotion(meetingId, agendaId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      threshold: String(formData.get("threshold") ?? "1/2"),
    });
    if (!motionId) return { error: "議程項目不存在或未授權" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "表決案設定不正確" };
  }
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function updateMotionAction(motionId: number, meetingId: number, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  const updated = await updateMotion(meetingId, motionId, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    threshold: String(formData.get("threshold") ?? "1/2"),
  });
  if (!updated) return { error: "表決已經開始或結束，無法修改" };
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function deleteMotionAction(motionId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  const deleted = await deleteMotion(meetingId, motionId);
  if (!deleted) return { error: "表決已經開始或結束，或該表決不屬於此會議" };
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

// ---- 主席控制（需求 3） ----

export async function startVoteAction(motionId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  const meeting = await getMeeting(meetingId);
  if (meeting?.status === "closed") return { error: "會議已結束，無法開放表決" };
  const r = await startVote(meetingId, motionId);
  if (r === "not-found") return { error: "表決案不存在或未授權" };
  if (r === "already-closed") return { error: "此案已結算，無法重新開放" };
  await notifyMeetingChanged(meetingId, "vote-started");
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return {};
}

export async function stopVoteAction(motionId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  if (!(await stopVote(meetingId, motionId))) return { error: "這個表決案不在進行中，或不屬於此會議" };
  await notifyMeetingChanged(meetingId, "vote-closed");
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return {};
}

// agendaItemId = null ＝ 回到簽到階段。
export async function setCurrentAgendaItemAction(meetingId: number, agendaItemId: number | null): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  await setCurrentAgendaItem(meetingId, agendaItemId);
  await notifyMeetingChanged(meetingId, "agenda-current");
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return {};
}

export async function nextAgendaItemAction(meetingId: number): Promise<FormState & { hasNext?: boolean }> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  const hasNext = await nextAgendaItem(meetingId);
  await notifyMeetingChanged(meetingId, "agenda-current");
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return { hasNext };
}

export async function prevAgendaItemAction(meetingId: number): Promise<FormState & { hasPrev?: boolean }> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  const hasPrev = await prevAgendaItem(meetingId);
  await notifyMeetingChanged(meetingId, "agenda-current");
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return { hasPrev };
}

// ---- 具名表決（需求 4） ----

export async function voteAction(
  motionId: number,
  meetingId: number,
  status: VoteStatus,
): Promise<FormState> {
  const session = await requireAccess();
  // ERR-002：server 端校驗投票選項，避免非法 enum 觸發 DB CHECK 例外（500）。
  if (status !== "agree" && status !== "against") {
    return { error: "投票選項不正確" };
  }
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { error: "找不到會議" };
  if (meeting.status === "closed") return { error: "會議已結束，無法表決" };
  if (!isStarted(meeting.starts_at)) return { error: "會議尚未開始，開始後才能表決" };
  if (!(await isParticipant(meetingId, session.email))) {
    return { error: "你未被邀請參與這場會議的表決" };
  }
  // 門檻分母是「已簽到人數」，沒簽到的人投了會讓同意票多過出席數。
  if (!(await getCheckInState(meetingId, session.email))) return { error: "請先完成簽到再表決" };
  const result = await submitBallot(motionId, { email: session.email, name: session.name }, status);
  if (result === "not-open") return { error: "表決尚未開放，或已經結束" };
  if (result === "duplicate") return { error: "你已經完成這項表決，無法更改" };
  if (result === "invalid") return { error: "投票選項不正確" };
  await rememberParticipantName(meetingId, session.email, session.name);
  await notifyMeetingChanged(meetingId, "ballot");
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return {};
}

// ---- 附件上傳（需求 2：附件空間） ----

export async function addAttachmentAction(
  agendaId: number,
  meetingId: number,
  formData: FormData,
): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "請選擇要上傳的檔案" };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "附件不可超過 10 MB" };

  const stored = await saveAttachment(file);
  const attachmentId = await addAttachment(meetingId, agendaId, {
    filename: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    storage_path: stored.path,
  });
  if (!attachmentId) {
    await deleteAttachmentFile(stored.path);
    return { error: "議程項目不存在或未授權" };
  }
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function deleteAttachmentAction(attachmentId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  const { getAttachment } = await import("@/lib/agenda");
  const att = await getAttachment(attachmentId);
  if (!att || att.meeting_id !== meetingId) return { error: "附件不存在或未授權" };
  await deleteAttachmentFile(att.storage_path);
  await prisma.agenda_attachments.deleteMany({ where: { id: attachmentId, agenda_items: { meeting_id: meetingId } } });
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

// ---- 批量匯入名單（需求 1a：文字/CSV 上傳，可帶年級，逐行 email[,年級]） ----

export async function addParticipantEmailsAction(meetingId: number, _prev: FormState, formData: FormData): Promise<FormState & { added?: number }> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };

  const raw = String(formData.get("participants") ?? "");
  const defaultGrade = String(formData.get("grade") ?? "").trim();
  const { parseParticipantLines, ValidationError: VE } = await import("@/lib/validation");
  let entries: { email: string; grade: string }[];
  try {
    entries = parseParticipantLines(raw, defaultGrade);
  } catch (err) {
    return { error: err instanceof VE ? err.message : "輸入資料不正確" };
  }

  // 已在名單裡的人只更新年級（原本的 ON CONFLICT DO UPDATE）
  for (const e of entries) {
    await prisma.participants.upsert({
      where: { meeting_id_email: { meeting_id: meetingId, email: e.email } },
      create: { meeting_id: meetingId, email: e.email, grade: e.grade },
      update: { grade: e.grade },
    });
  }
  const added = entries.length;
  await notifyMeetingChanged(meetingId, "edit");
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/checkin?id=${meetingId}`);
  return { added };
}

// ---- 工作人員現場簽到（需求 1d：年級篩選，各年級工作人員協助登入簽到） ----
// 「工作人員」＝ admin、建立者、或建立者授權的協作者（meeting_editors）；
// 不是任一 moderator——否則任何幹部都能對別人的會議代簽到。

export async function staffCheckInAction(meetingId: number, email: string): Promise<FormState> {
  const session = await requireManager();
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { error: "找不到會議" };
  if (!(await canWriteNotes(meeting, session, isAdmin(session)))) return { error: "你沒有權限為這場會議代簽到" };
  if (meeting.status === "closed") return { error: "會議已結束，無法簽到" };
  if (!isStarted(meeting.starts_at)) return { error: "會議尚未開始，開始後才能簽到" };
  if (!(await isParticipant(meetingId, email))) return { error: "此人未被邀請" };
  const status = await setCheckIn(meetingId, email);
  if (status === "not-invited") return { error: "此人未被邀請" };
  await rememberEditorName(meetingId, session.email, session.name);
  await notifyMeetingChanged(meetingId, "checkin");
  revalidatePath(`/checkin?id=${meetingId}`);
  return {};
}

export async function noteAction(meetingId: number, body: string): Promise<FormState> {
  const session = await requireAccess();
  const text = body.trim();
  if (text.length < 1 || text.length > 5000) return { error: "紀錄內容需介於 1 到 5000 字" };

  const detail = await getMeetingDetail(meetingId);
  if (!detail) return { error: "找不到這份會議" };

  // 需求：僅創建者（或 admin）與被明確授權的協作者可新增會議記錄
  const canNote = await canWriteNotes(detail.meeting, session, isAdmin(session));
  if (!canNote) return { error: "你沒有權限新增紀錄（僅會議創建者與被授權成員可操作）" };

  await addNote(meetingId, { sub: session.sub, email: session.email, name: session.name }, text);
  await rememberEditorName(meetingId, session.email, session.name);
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

// 刪除單則會議記錄。權限：admin／創建者可刪任一則，其餘人只能刪自己寫的（見 canDeleteNote）。
// 用 requireAccess 而不是 requireManager——協作者可能是一般學生，requireManager 會把他們踢去 /forbidden。
export async function deleteNoteAction(meetingId: number, noteId: number): Promise<FormState> {
  const session = await requireAccess();
  const note = await getNoteOwner(noteId);
  // meeting_id 一定要對得上：否則可以拿自己那場會議的 id 去借權限刪別場的紀錄。
  if (!note || note.meeting_id !== meetingId) return { error: "找不到這則紀錄" };

  const meeting = await getMeeting(meetingId);
  if (!meeting) return { error: "找不到這份會議" };
  if (!canDeleteNote(note, meeting, session, isAdmin(session)))
    return { error: "你沒有權限刪除這則紀錄" };

  await deleteNote(noteId);
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

// 授權某人成為該會議的「可寫記錄」協作者（僅創建者或 admin）。
export async function addNoteEditorAction(meetingId: number, email: string): Promise<FormState> {
  const session = await requireManager();
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { error: "找不到這份會議" };
  if (!(isAdmin(session) || meeting.owner_sub === session.sub))
    return { error: "只有會議創建者或管理員可授權他人新增記錄" };
  if (!email.trim() || !email.includes("@")) return { error: "請提供有效的信箱" };

  await addMeetingEditor(meetingId, email.trim(), session.email);
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

// ---- 權限輔助 ----

async function canEditMeeting(meetingId: number, session: Awaited<ReturnType<typeof requireManager>>): Promise<boolean> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return false;
  if (isAdmin(session) || meeting.owner_sub === session.sub) return true;
  return false;
}

// ---- 管理面板（僅 admin） ----

export async function importMeetingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState & { count?: number }> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "請選擇要匯入的 JSON 檔案" };
  if (file.size > 10 * 1024 * 1024) return { error: "匯入檔案不可超過 10 MB" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { error: "JSON 解析失敗" };
  }
  try {
    const count = await importAll(parsed);
    revalidatePath("/");
    revalidatePath("/panel");
    return { count };
  } catch (err) {
    return {
      error: err instanceof ValidationError ? err.message : "匯入失敗，請檢查檔案內容",
    };
  }
}

export async function uploadBgmAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState & { saved?: boolean }> {
  await requireAdmin();
  const file = formData.get("bgm");
  if (!(file instanceof File)) return { error: "請選擇 mp3 檔案" };
  if (file.size > MAX_BGM_BYTES) return { error: "BGM 檔案不可超過 10 MB" };
  if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) {
    return { error: "僅支援 mp3 檔案" };
  }
  await saveBgm(Buffer.from(await file.arrayBuffer()));
  revalidatePath("/panel");
  return { saved: true };
}

export async function clearBgmAction(): Promise<FormState> {
  await requireAdmin();
  await clearBgm();
  revalidatePath("/panel");
  revalidatePath("/read");
  return {};
}

export async function createApiKeyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState & { key?: string; created?: { id: number; label: string; created_at: string } }> {
  await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  if (!label || label.length > 100) return { error: "請輸入金鑰名稱（100 字內）" };
  const { plaintext, id } = await createApiKey(label);
  revalidatePath("/panel");
  return {
    key: plaintext,
    created: { id, label, created_at: new Date().toISOString() },
  };
}

export async function deleteApiKeyAction(id: number): Promise<FormState> {
  await requireAdmin();
  await deleteApiKey(id);
  revalidatePath("/panel");
  return {};
}

// ---- 部會清單（僅 admin，/panel） ----

export async function addDepartmentAction(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const res = await addDepartment(String(formData.get("name") ?? ""));
  if (res.error) return res;
  revalidatePath("/");
  return {};
}

export async function deleteDepartmentAction(name: string): Promise<FormState> {
  await requireAdmin();
  if (!(await removeDepartment(name))) return { error: "找不到這個部會" };
  revalidatePath("/");
  return {};
}
