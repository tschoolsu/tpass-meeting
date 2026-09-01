import { NextResponse } from "next/server";
import { authenticateApiKey, extractKey } from "@/lib/api-keys";
import { rateLimitByKey } from "@/lib/rate-limit";
import { getMeetingDetail } from "@/lib/meetings";

// GET /api/v1/meetings/:id/checkins —— 已簽到／未簽到清單。
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

  const checkedIn = detail.participants.filter((p) => p.checked_in).map((p) => p.email);
  const notCheckedIn = detail.participants.filter((p) => !p.checked_in).map((p) => p.email);

  return NextResponse.json({
    meeting_id: detail.meeting.id,
    total: detail.participants.length,
    checked_in: checkedIn,
    not_checked_in: notCheckedIn,
  });
}
