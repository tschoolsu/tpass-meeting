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
import { query } from "@/lib/db";
import { createApiKey, deleteApiKey } from "@/lib/api-keys";
import { importAll } from "@/lib/backup";
import { saveBgm, clearBgm, MAX_BGM_BYTES } from "@/lib/bgm";
import {
  addMeetingEditor,
  addNote,
  canWriteNotes,
  createMeeting,
  deleteMeeting,
  getMeeting,
  getMeetingDetail,
  isParticipant,
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
  getMotion,
  moveAgendaItem,
  nextAgendaItem,
  setCurrentAgendaItem,
  startVote,
  stopVote,
  submitBallot,
  updateAgendaItem,
  updateMotion,
} from "@/lib/agenda";
import { broadcast } from "@/lib/stream";
import {
  saveAttachment,
  deleteAttachmentFile,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/attachment-store";
import { enqueueMeetingNotification, dispatchPendingEmails } from "@/lib/email";
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
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function deleteMeetingAction(id: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await deleteMeeting(id, session.sub, isAdmin(session));
  if (!ok) return { error: "你沒有權限刪除這份會議記錄" };
  revalidatePath("/");
  redirect("/");
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

  const { rowCount } = await query(`UPDATE meetings SET status = $1 WHERE id = $2 AND status = $3`, [status, id, meeting.status]);
  if (rowCount === 0) return { error: "狀態已被其他人更新，請重新整理" };

  if (meeting.status === "draft" && status === "published") {
    // 第一次發布才寄通知（需求 6）：進佇列並嘗試立即派送。
    await enqueueMeetingNotification(id);
    await dispatchPendingEmails();
  }
  revalidatePath(`/read?id=${id}`);
  return {};
}

async function hasOpenMotion(meetingId: number): Promise<boolean> {
  const { rows } = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM motions m JOIN agenda_items a ON a.id = m.agenda_item_id
      WHERE a.meeting_id = $1 AND m.status = open`,
    [meetingId],
  );
  return (rows[0]?.n ?? 0) > 0;
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
  // 廣播簽到事件：SSE 健康時前端不再靠 3 秒輪詢追變化（C-2）
  if (status === "ok") await broadcast(meetingId, "CHECKIN", { meetingId, email: session.email });
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
  revalidatePath(`/read?id=${meetingId}`);
  return {};
}

export async function deleteAgendaItemAction(agendaId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限編輯這份會議" };
  const deleted = await deleteAgendaItem(meetingId, agendaId);
  if (!deleted) return { error: "議程項目不存在或未授權" };
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
    const motionId = await addMotion(meetingId, agendaId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      threshold: String(formData.get("threshold") ?? "1/2+1/2"),
    });
    if (!motionId) return { error: "議程項目不存在或未授權" };
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
  const updated = await updateMotion(meetingId, motionId, {
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
  const deleted = await deleteMotion(meetingId, motionId);
  if (!deleted) return { error: "表決已經開始或結束，或該表決不屬於此會議" };
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
  const started = await startVote(meetingId, motionId);
  if (!started) return { error: "表決案不存在或未授權" };

  // 即時推播：表決開始 → VOTE_STARTED（帶上該表決案的選項內容）
  const motion = await getMotion(motionId);
  if (motion) {
    await broadcast(meetingId, "VOTE_STARTED", {
      meetingId,
      motion: {
        id: motion.id,
        agenda_item_id: motion.agenda_item_id,
        title: motion.title,
        threshold: motion.threshold,
        status: "open",
        agree: 0,
        against: 0,
      },
    });
  }

  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return {};
}

export async function stopVoteAction(motionId: number, meetingId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  const stopped = await stopVote(meetingId, motionId);
  if (!stopped) return { error: "表決案不存在或未授權" };

  const motion = await getMotion(motionId);
  if (motion) {
    await broadcast(meetingId, "VOTE_CLOSED", { meetingId, motionId, status: "closed" });
  }

  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return {};
}

export async function setCurrentAgendaItemAction(meetingId: number, agendaItemId: number): Promise<FormState> {
  const session = await requireManager();
  const ok = await canEditMeeting(meetingId, session);
  if (!ok) return { error: "你沒有權限控制這份會議" };
  await setCurrentAgendaItem(meetingId, agendaItemId);
  // 廣播議程切換：/display、/read 收到後撈一次快照即可（C-2）
  await broadcast(meetingId, "AGENDA_CHANGED", { meetingId, agendaItemId });
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
  if (hasNext) await broadcast(meetingId, "AGENDA_CHANGED", { meetingId });
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/chair?id=${meetingId}`);
  revalidatePath(`/display?id=${meetingId}`);
  return { hasNext };
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
  const result = await submitBallot(motionId, session.email, status);
  if (result === "not-open") return { error: "表決尚未開放，或已經結束" };
  if (result === "duplicate") return { error: "你已經完成這項表決，無法更改" };
  if (result === "invalid") return { error: "投票選項不正確" };
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
  const { query } = await import("@/lib/db");
  await query(
    `DELETE FROM agenda_attachments
      WHERE id = $1 AND agenda_item_id IN (SELECT id FROM agenda_items WHERE meeting_id = $2)`,
    [attachmentId, meetingId],
  );
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
  if (status === "ok") await broadcast(meetingId, "CHECKIN", { meetingId, email });
  revalidatePath(`/checkin?id=${meetingId}`);
  return { error: status === "not-invited" ? "此人未被邀請" : undefined };
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
