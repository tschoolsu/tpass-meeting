import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/meetings";

// GET /api/live/meeting/:id —— 供前端短輪詢的輕量實時資料（需求 3、5）。
// 需登入；參與人與管理者皆可讀取。
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) return NextResponse.json({ error: "id 格式不正確" }, { status: 400 });
  const meetingId = Number(raw);

  const detail = await getMeetingDetail(meetingId);
  if (!detail) return NextResponse.json({ error: "找不到會議" }, { status: 404 });

  return NextResponse.json({
    meeting: {
      id: detail.meeting.id,
      title: detail.meeting.title,
      status: detail.meeting.status,
      starts_at: detail.meeting.starts_at,
    },
    checked_in: detail.participants.filter((p) => p.checked_in).length,
    total: detail.participants.length,
    current: detail.agenda[0] ?? null,
    agenda: detail.agenda.map((a) => ({
      id: a.id,
      position: a.position,
      title: a.title,
      description: a.description,
      motions: a.motions.map((m) => ({
        id: m.id,
        title: m.title,
        threshold: m.threshold,
        status: m.status,
        agree: m.agree,
        against: m.against,
        abstain: m.abstain,
      })),
    })),
  });
}
