import type { MeetingInput } from "@/lib/meetings";
import { parseTaipeiLocal } from "@/lib/time";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MAX_PARTICIPANTS = 500;

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

function parseText(raw: unknown, max: number, label: string): string {
  const value = String(raw ?? "").trim();
  if (value.length > max) throw new ValidationError(`${label}不可超過 ${max} 字`);
  return value;
}

export function parseMeeting(formData: FormData): MeetingInput {
  return {
    title: parseTitle(String(formData.get("title") ?? "")),
    department: String(formData.get("department") ?? "").trim(),
    startsAt: parseStartsAt(String(formData.get("starts_at") ?? "")),
    participantEmails: parseParticipants(String(formData.get("participants") ?? "")),
    location: parseText(formData.get("location"), 200, "地點"),
    onlineLink: parseText(formData.get("online_link"), 1000, "線上連結"),
    description: parseText(formData.get("description"), 10000, "會議說明"),
  };
}

// API 建立會議用：接受 JSON body（participants 可為陣列或換行字串）。
export function parseMeetingPayload(body: unknown): MeetingInput {
  if (typeof body !== "object" || body === null) throw new ValidationError("請求內容格式不正確");
  const b = body as Record<string, unknown>;
  const toLines = (v: unknown) => (Array.isArray(v) ? v.map(String).join("\n") : String(v ?? ""));
  return {
    title: parseTitle(String(b.title ?? "")),
    department: String(b.department ?? "").trim(),
    startsAt: parseStartsAt(String(b.starts_at ?? "")),
    participantEmails: parseParticipants(toLines(b.participants)),
    location: parseText(b.location, 200, "地點"),
    onlineLink: parseText(b.online_link, 1000, "線上連結"),
    description: parseText(b.description, 10000, "會議說明"),
  };
}
