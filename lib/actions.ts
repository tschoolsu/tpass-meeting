"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAdmin,
  isModerator,
  requireAccess,
  requireManager,
} from "@/lib/auth";
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

export interface FormState {
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PARTICIPANTS = 500;
const MAX_QUESTIONS = 50;

export function parseParticipants(raw: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[\n,;]/)) {
    const email = part.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) throw new Error(`信箱格式不正確：${email}`);
    if (!seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }
  if (emails.length > MAX_PARTICIPANTS) throw new Error(`參與人最多 ${MAX_PARTICIPANTS} 人`);
  return emails;
}

function parseQuestions(raw: string): string[] {
  const questions: string[] = [];
  for (const part of raw.split("\n")) {
    const q = part.trim();
    if (!q) continue;
    if (q.length > 500) throw new Error("表決題目不可超過 500 字");
    questions.push(q);
  }
  if (questions.length > MAX_QUESTIONS) throw new Error(`表決題目最多 ${MAX_QUESTIONS} 題`);
  return questions;
}

function parseDate(raw: string): string {
  const value = raw.trim();
  if (!DATE_RE.test(value)) throw new Error("日期格式不正確");
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error("日期格式不正確");
  }
  return value;
}

function parseTitle(raw: string): string {
  const title = raw.trim();
  if (title.length < 1 || title.length > 200) throw new Error("標題長度需介於 1 到 200 字");
  return title;
}

function parseMeeting(formData: FormData): MeetingInput {
  const votingEnabled = formData.get("voting_enabled") === "true" || formData.get("voting_enabled") === "on";
  return {
    title: parseTitle(String(formData.get("title") ?? "")),
    department: String(formData.get("department") ?? "").trim(),
    meetingDate: parseDate(String(formData.get("meeting_date") ?? "")),
    participantEmails: parseParticipants(String(formData.get("participants") ?? "")),
    votingEnabled,
    questions: votingEnabled ? parseQuestions(String(formData.get("questions") ?? "")) : [],
  };
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
    return { error: err instanceof Error ? err.message : "輸入資料不正確" };
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
    return { error: err instanceof Error ? err.message : "輸入資料不正確" };
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
  if (!isAdmin(session)) {
    const invited = await isParticipant(meetingId, session.email);
    if (!invited) return { error: "你未被邀請參與這場會議" };
  }
  const status = await setCheckIn(meetingId, session.email);
  revalidatePath(`/read?id=${meetingId}`);
  revalidatePath(`/checkin?id=${meetingId}`);
  if (status === "not-invited") return { error: "你未被邀請參與這場會議" };
  return { done: true };
}

export async function voteAction(
  voteId: number,
  answer: boolean,
): Promise<FormState & { nextVoteId?: number | null }> {
  const session = await requireAccess();
  const flow = await getVoteFlow(voteId, session.email);
  if (!flow) return { error: "找不到這份表決" };
  if (!isAdmin(session) && !(await isParticipant(flow.meeting.id, session.email))) {
    return { error: "你未被邀請參與這場會議的表決" };
  }
  if (flow.alreadyVoted) return { error: "你已經完成這題的表決，無法更改" };

  const status = await submitBallot(voteId, session.email, answer);
  if (status === "duplicate") return { error: "你已經完成這題的表決，無法更改" };

  revalidatePath(`/read?id=${flow.meeting.id}`);
  revalidatePath(`/vote?id=${voteId}`);
  return { nextVoteId: flow.nextVoteId };
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
