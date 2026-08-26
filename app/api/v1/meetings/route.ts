import { NextResponse } from "next/server";
import { authenticateApiKey, extractKey } from "@/lib/api-keys";
import { createMeeting, getMeetingDetail } from "@/lib/meetings";
import { parseMeetingPayload, ValidationError } from "@/lib/validation";

// POST /api/v1/meetings —— 建立會議（需 API key）。
export async function POST(request: Request) {
  const key = extractKey(request);
  if (!key) return NextResponse.json({ error: "缺少 API key" }, { status: 401 });
  const identity = await authenticateApiKey(key);
  if (!identity) return NextResponse.json({ error: "API key 無效" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求內容不是有效的 JSON" }, { status: 400 });
  }

  let input;
  try {
    input = parseMeetingPayload(body);
    if (input.votingEnabled && input.questions.length === 0) {
      return NextResponse.json({ error: "啟用表決時至少要填寫一題" }, { status: 400 });
    }
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
  const detail = await getMeetingDetail(id);
  return NextResponse.json(
    { id, vote_id: detail?.vote?.id ?? null },
    { status: 201 },
  );
}
