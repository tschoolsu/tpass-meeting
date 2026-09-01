import { NextResponse } from "next/server";
import { authenticateApiKey, extractKey } from "@/lib/api-keys";
import { rateLimitByKey } from "@/lib/rate-limit";
import { createMeeting } from "@/lib/meetings";
import { parseMeetingPayload, ValidationError } from "@/lib/validation";

// POST /api/v1/meetings —— 建立會議（需 API key）。
// H-5：建立會議較重（可能一次帶入 500 名參與人），每把 key 每分鐘上限較緊。
const CREATE_PER_MIN = 20;

export async function POST(request: Request) {
  const key = extractKey(request);
  if (!key) return NextResponse.json({ error: "缺少 API key" }, { status: 401 });
  const identity = await authenticateApiKey(key);
  if (!identity) return NextResponse.json({ error: "API key 無效" }, { status: 401 });

  const limit = rateLimitByKey(`apikey:${identity.id}`, CREATE_PER_MIN);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "建立會議過於頻繁，請稍後再試" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求內容不是有效的 JSON" }, { status: 400 });
  }

  let input;
  try {
    input = parseMeetingPayload(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof ValidationError ? err.message : "輸入資料不正確" },
      { status: 400 },
    );
  }

  const id = await createMeeting(input, {
    sub: `apikey:${identity.id}`,
    email: "",
    name: `API：${identity.label}`,
  });
  return NextResponse.json({ id }, { status: 201 });
}
