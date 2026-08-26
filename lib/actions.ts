"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAdmin,
  isModerator,
  requireAccess,
  requireManager,
} from "@/lib/auth";
import { isStarted } from "@/lib/time";
import {
  addNote,
  createMeeting,
  deleteMeeting,
  getMeetingDetail,
  getVoteFlow,
  isParticipant,
  setCheckIn,
  submitBallot,
  updateMeeting,
  type MeetingInput,
} from "@/lib/meetings";
import { parseMeeting, ValidationError } from "@/lib/validation";

export interface FormState {
  error?: string;
}

export async function createMeetingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  let input: MeetingInput;
  try {
    input = parseMeeting(formData);
    if (input.votingEnabled && input.questions.length === 0) {
      return { error: "啟用表決時至少要填寫一題" };
    }
  } catch (err) {
    return { error: err instanceof ValidationError ? err.message : "輸入資料不正確" };
  }

  const id = await createMeeting(input, {
    sub: session.sub,
    email: session.email,
    name: session.name,
  });
  revalidatePath("/");
  redirect(`/read?id=${id}`);
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
    if (input.votingEnabled && input.questions.length === 0) {
      return { error: "啟用表決時至少要填寫一題" };
    }
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

export async function checkInAction(meetingId: number): Promise<FormState & { done?: boolean }> {
  const session = await requireAccess();
  const invited = await isParticipant(meetingId, session.email);
  if (!invited) return { error: "你未被邀請參與這場會議" };
  const status = await setCheckIn(meetingId, session.email);
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/checkin?id=${meetingId}`);
  if (status === "not-invited") return { error: "你未被邀請參與這場會議" };
  return { done: true };
}

export async function voteAction(
  voteId: number,
  questionId: number,
  answer: boolean,
): Promise<FormState> {
  const session = await requireAccess();
  const flow = await getVoteFlow(voteId, session.email);
  if (!flow) return { error: "找不到這份表決" };
  if (!isStarted(flow.meeting.starts_at)) {
    return { error: "會議尚未開始，開始後才能表決" };
  }
  if (!(await isParticipant(flow.meeting.id, session.email))) {
    return { error: "你未被邀請參與這場會議的表決" };
  }
  const question = flow.questions.find((q) => q.id === questionId);
  if (!question) return { error: "找不到這道表決題目" };
  if (flow.answered.has(questionId)) return { error: "你已經完成這題的表決，無法更改" };

  const status = await submitBallot(questionId, session.email, answer);
  if (status === "duplicate") return { error: "你已經完成這題的表決，無法更改" };

  revalidatePath(`/read?id=${flow.meeting.id}`);
  revalidatePath(`/vote?id=${voteId}`);
  return {};
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
