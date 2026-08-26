import type { MeetingInput } from "@/lib/meetings";
import { parseTaipeiLocal } from "@/lib/time";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MAX_PARTICIPANTS = 500;
const MAX_QUESTIONS = 50;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parseParticipants(raw: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[\n,;]/)) {
    const email = part.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) throw new ValidationError(`信箱格式不正確：${email}`);
    if (!seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }
  if (emails.length > MAX_PARTICIPANTS) throw new ValidationError(`參與人最多 ${MAX_PARTICIPANTS} 人`);
  return emails;
}

function parseQuestions(raw: string): string[] {
  const questions: string[] = [];
  for (const part of raw.split("\n")) {
    const q = part.trim();
    if (!q) continue;
    if (q.length > 500) throw new ValidationError("表決題目不可超過 500 字");
    questions.push(q);
  }
  if (questions.length > MAX_QUESTIONS) throw new ValidationError(`表決題目最多 ${MAX_QUESTIONS} 題`);
  return questions;
}

function parseStartsAt(raw: string): string {
  const value = raw.trim();
  if (!DATETIME_RE.test(value)) throw new ValidationError("會議開始時間格式不正確");
  const date = parseTaipeiLocal(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError("會議開始時間格式不正確");
  return value;
}

function parseTitle(raw: string): string {
  const title = raw.trim();
  if (title.length < 1 || title.length > 200) throw new ValidationError("標題長度需介於 1 到 200 字");
  return title;
}

export function parseMeeting(formData: FormData): MeetingInput {
  const votingEnabled = formData.get("voting_enabled") === "true" || formData.get("voting_enabled") === "on";
  return {
    title: parseTitle(String(formData.get("title") ?? "")),
    department: String(formData.get("department") ?? "").trim(),
    startsAt: parseStartsAt(String(formData.get("starts_at") ?? "")),
    participantEmails: parseParticipants(String(formData.get("participants") ?? "")),
    votingEnabled,
    questions: votingEnabled ? parseQuestions(String(formData.get("questions") ?? "")) : [],
  };
}
