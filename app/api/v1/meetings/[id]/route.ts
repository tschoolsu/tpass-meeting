import { NextResponse } from "next/server";
import { authenticateApiKey, extractKey } from "@/lib/api-keys";
import { getMeetingDetail } from "@/lib/meetings";

// GET /api/v1/meetings/:id —— 會議資訊（含 vote id、題目、參與人、紀錄）。
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = extractKey(request);
  if (!key) return NextResponse.json({ error: "缺少 API key" }, { status: 401 });
  if (!(await authenticateApiKey(key))) {
    return NextResponse.json({ error: "API key 無效" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "會議 id 格式不正確" }, { status: 400 });

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
    },
    vote: detail.vote,
    participants: detail.participants.map((p) => ({ email: p.email, checked_in: p.checked_in })),
    notes: detail.notes,
  });
}
