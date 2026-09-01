import { NextResponse } from "next/server";
import { authenticateApiKey, extractKey } from "@/lib/api-keys";
import { rateLimitByKey } from "@/lib/rate-limit";
import { getMeetingDetail } from "@/lib/meetings";
import { derivePhase } from "@/lib/meeting-status";

// GET /api/v1/meetings/:id —— 會議資訊（含 vote id、題目、參與人、紀錄）。
// H-5：讀取型 endpoint 每把 key 每分鐘上限較寬。
const GET_PER_MIN = 300;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = extractKey(request);
  if (!key) return NextResponse.json({ error: "缺少 API key" }, { status: 401 });
  const identity = await authenticateApiKey(key);
  if (!identity) return NextResponse.json({ error: "API key 無效" }, { status: 401 });

  const limit = rateLimitByKey(`apikey:${identity.id}`, GET_PER_MIN);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "請求過於頻繁，請稍後再試" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return NextResponse.json({ error: "會議 id 格式不正確" }, { status: 400 });

  const detail = await getMeetingDetail(Number(id));
  if (!detail) return NextResponse.json({ error: "找不到會議" }, { status: 404 });

  return NextResponse.json({
    meeting: {
      id: detail.meeting.id,
      title: detail.meeting.title,
      department: detail.meeting.department,
      meeting_date: detail.meeting.meeting_date,
      starts_at: detail.meeting.starts_at,
      owner_email: detail.meeting.owner_email,
      owner_name: detail.meeting.owner_name,
      voting_enabled: detail.meeting.voting_enabled,
      location: detail.meeting.location,
      online_link: detail.meeting.online_link,
      description: detail.meeting.description,
      status: detail.meeting.status,
      // 畫面用的推導狀態（draft / scheduled / live / closed）；status 是 DB 原值，兩者都給。
      phase: derivePhase(detail.meeting.status, detail.meeting.starts_at),
    },
    agenda: detail.agenda,
    participants: detail.participants.map((p) => ({ email: p.email, name: p.name, grade: p.grade, checked_in: p.checked_in })),
    notes: detail.notes,
  });
}
