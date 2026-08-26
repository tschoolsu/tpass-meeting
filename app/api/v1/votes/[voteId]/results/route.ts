import { NextResponse } from "next/server";
import { authenticateApiKey, extractKey } from "@/lib/api-keys";
import { getVoteResults } from "@/lib/meetings";

// GET /api/v1/votes/:voteId/results —— 表決結果（各題各選項人數與百分比）。
export async function GET(request: Request, { params }: { params: Promise<{ voteId: string }> }) {
  const key = extractKey(request);
  if (!key) return NextResponse.json({ error: "缺少 API key" }, { status: 401 });
  if (!(await authenticateApiKey(key))) {
    return NextResponse.json({ error: "API key 無效" }, { status: 401 });
  }

  const { voteId } = await params;
  if (!/^\d+$/.test(voteId)) return NextResponse.json({ error: "表決 id 格式不正確" }, { status: 400 });

  const results = await getVoteResults(Number(voteId));
  if (!results) return NextResponse.json({ error: "找不到表決" }, { status: 404 });

  return NextResponse.json(results);
}
