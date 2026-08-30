"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAdmin,
  isModerator,
  requireAccess,
  requireAdmin,
  requireManager,
} from "@/lib/auth";
import { isStarted } from "@/lib/time";
import { createApiKey, deleteApiKey } from "@/lib/api-keys";
import { importAll } from "@/lib/backup";
import { saveBgm, clearBgm, MAX_BGM_BYTES } from "@/lib/bgm";
import {
  addNote,
  createMeeting,
  deleteMeeting,
  getMeeting,
  getMeetingDetail,
  isParticipant,
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
  startVote,
  stopVote,
  submitBallot,
  updateAgendaItem,
  updateMotion,
} from "@/lib/agenda";
import {
  saveAttachment,
  deleteAttachmentFile,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/attachment-store";
import { enqueueMeetingNotification, dispatchPendingEmails } from "@/lib/email";
import { canStudentCreate } from "@/lib/permissions";
import { parseMeeting, ValidationError } from "@/lib/validation";

export interface FormState {
  error?: string;
}

export async function createMeetingAction(_prev: FormState, formData: FormData): Promise<FormState> {
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
  redirect(`/read?id=${meetingId}`);
}

export async function updateMeetingAction(
  id: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
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
  redirect(`/read?id=${id}`);
}

export async function deleteMeetingAction(id: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await deleteMeeting(id, session.sub, isAdmin(session));
  if (!ok) return { error: "你沒有權限刪除這份會議記錄" };
  revalidatePath("/");
  redirect("/");
}

export async function setMeetingStatusAction(id: number, status: string): Promise<FormState> {
  const session = await requireManager();
  const ok = await setMeetingStatus(id, status, session.sub, isAdmin(session));
  if (!ok) return { error: "你沒有權限更新會議狀態" };
  revalidatePath(`/read?id=${id}`);
  if (status === "published") {
    // 發布後自動觸發 Email 通知（背景），並嘗試立即派送（需求 6）。
    await enqueueMeetingNotification(id);
    await dispatchPendingEmails();
  }
  revalidatePath(`/read?id=${id}`);
  return {};
}

async function setMeetingStatus(id: number, status: string, ownerSub: string, isAdminUser: boolean): Promise<boolean> {
  const meeting = await getMeeting(id);
  if (!meeting) return false;
  if (!isAdminUser && meeting.owner_sub !== ownerSub) return false;
  if (!["draft", "published", "live", "closed"].includes(status)) return false;
  const { rowCount } = await import("@/lib/db").then((db) =>
    db.query(`UPDATE meetings SET status = $1 WHERE id = $2`, [status, id]),
  );
  return rowCount > 0;
}

export async function checkInAction(meetingId: number): Promise<FormState & { done?: boolean }> {
  const session = await requireAccess();
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { error: "找不到會議" };
  if (!isStarted(meeting.starts_at)) return { error: "會議尚未開始，開始後才能簽到" };
  const invited = await isParticipant(meetingId, session.email);
  if (!invited) return { error: "你未被邀請參與這場會議" };
  const status = await setCheckIn(meetingId, session.email);
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/checkin?id=${meetingId}`);
  if (status === "not-invited") return { error: "你未被邀請參與這場會議" };
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
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function updateAgendaItemAction(agendaId: number, meetingId: number, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  await updateAgendaItem(agendaId, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function deleteAgendaItemAction(agendaId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  await deleteAgendaItem(agendaId);
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function moveAgendaItemAction(agendaId: number, dir: "up" | "down", meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  await moveAgendaItem(agendaId, dir, meetingId);
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function addMotionAction(agendaId: number, meetingId: number, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  try {
    await addMotion(agendaId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      threshold: String(formData.get("threshold") ?? "1/2+1/2"),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "表決案設定不正確" };
  }
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function updateMotionAction(motionId: number, meetingId: number, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  const updated = await updateMotion(motionId, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    threshold: String(formData.get("threshold") ?? "1/2+1/2"),
  });
  if (!updated) return { error: "表決已經開始或結束，無法修改" };
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function deleteMotionAction(motionId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  const deleted = await deleteMotion(motionId);
  if (!deleted) return { error: "表決已經開始或結束，無法刪除" };
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

// ---- 主席控制（需求 3） ----

export async function startVoteAction(motionId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  await startVote(motionId);
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return {};
}

export async function stopVoteAction(motionId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  await stopVote(motionId);
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return {};
}

// ---- 具名表決（需求 4） ----

export async function voteAction(
  motionId: number,
  meetingId: number,
  status: VoteStatus,
): Promise<FormState> {
  const session = await requireAccess();
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { error: "找不到會議" };
  if (!isStarted(meeting.starts_at)) return { error: "會議尚未開始，開始後才能表決" };
  if (!(await isParticipant(meetingId, session.email))) {
    return { error: "你未被邀請參與這場會議的表決" };
  }
  const result = await submitBallot(motionId, session.email, status);
  if (result === "not-open") return { error: "表決尚未開放，或已經結束" };
  if (result === "duplicate") return { error: "你已經完成這項表決，無法更改" };
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
  await addAttachment(agendaId, {
    filename: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    storage_path: stored.path,
  });
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function deleteAttachmentAction(attachmentId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  const { getAttachment } = await import("@/lib/agenda");
  const att = await getAttachment(attachmentId);
  if (att) await deleteAttachmentFile(att.storage_path);
  const { query } = await import("@/lib/db");
  await query(`DELETE FROM agenda_attachments WHERE id = $1`, [attachmentId]);
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

  const { query } = await import("@/lib/db");
  let added = 0;
  for (const e of entries) {
    const r = await query(
      `INSERT INTO participants (meeting_id, email, grade)
       VALUES ($1, $2, $3)
       ON CONFLICT (meeting_id, email) DO UPDATE SET grade = EXCLUDED.grade`,
      [meetingId, e.email, e.grade],
    );
    if (r.rowCount && r.rowCount > 0) added++;
  }
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/checkin?id=${meetingId}`);
  return { added };
}

// ---- 工作人員現場簽到（需求 1d：年級篩選，各年級工作人員協助登入簽到） ----

export async function staffCheckInAction(meetingId: number, email: string): Promise<FormState> {
  await requireManager();
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { error: "找不到會議" };
  if (!isStarted(meeting.starts_at)) return { error: "會議尚未開始，開始後才能簽到" };
  if (!(await isParticipant(meetingId, email))) return { error: "此人未被邀請" };
  const status = await setCheckIn(meetingId, email);
  revalidatePath(`/checkin?id=${meetingId}`);
  return { error: status === "not-invited" ? "此人未被邀請" : undefined };
}

export async function noteAction(meetingId: number, body: string): Promise<FormState> {
  const session = await requireAccess();
  const text = body.trim();
  if (text.length < 1 || text.length > 5000) return { error: "紀錄內容需介於 1 到 5000 字" };

  const detail = await getMeetingDetail(meetingId);
  if (!detail) return { error: "找不到這份會議" };

  const canNote =
    isAdmin(session) || isModerator(session) || (await isParticipant(meetingId, session.email));
  if (!canNote) return { error: "你沒有權限新增紀錄" };

  await addNote(meetingId, { email: session.email, name: session.name }, text);
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
