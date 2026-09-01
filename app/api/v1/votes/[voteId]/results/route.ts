import { NextResponse } from "next/server";
import { authenticateApiKey, extractKey } from "@/lib/api-keys";
import { rateLimitByKey } from "@/lib/rate-limit";
import { getMotionResults } from "@/lib/agenda";

// GET /api/v1/votes/:voteId/results —— 表決案結果（具名統計，需求 4：公開透明）。
// 註：voteId 在此即為「表決案 motion id」。
// H-5：讀取型 endpoint 每把 key 每分鐘上限較寬。
const GET_PER_MIN = 300;

export async function GET(request: Request, { params }: { params: Promise<{ voteId: string }> }) {
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

  const { voteId } = await params;
  if (!/^\d{1,9}$/.test(voteId)) return NextResponse.json({ error: "表決 id 格式不正確" }, { status: 400 });

  const results = await getMotionResults(Number(voteId));
  if (!results) return NextResponse.json({ error: "找不到表決" }, { status: 404 });

  return NextResponse.json(results);
}
