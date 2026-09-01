import { NextResponse } from "next/server";
import { getSession, isModerator } from "@/lib/auth";
import { canViewMeeting, getMeetingDetail, isParticipant } from "@/lib/meetings";
import { derivePhase } from "@/lib/meeting-status";

// GET /api/live/meeting/:id —— 供前端短輪詢的輕量實時資料（需求 3、5）。
// 需登入；參與人與管理者皆可讀取。
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) return NextResponse.json({ error: "id 格式不正確" }, { status: 400 });
  const meetingId = Number(raw);

  const detail = await getMeetingDetail(meetingId);
  if (!detail) return NextResponse.json({ error: "找不到會議" }, { status: 404 });

  // SEC-001：非管理員／非參與人不可讀取即時資料。
  if (!canViewMeeting(detail.meeting, session, isModerator(session), await isParticipant(meetingId, session.email))) {
    return NextResponse.json({ error: "找不到會議" }, { status: 404 });
  }

  // C-4：即時端點只回「計數」聚合，不再每次把已結算 motion 的全量 ballots 整包序列化。
  // 結算名單（每人票）改由前端按需向 /api/live/meeting/:id/ballots 載入（只載一次）。
  const curMotions = detail.current
    ? detail.current.motions.map((m) => ({
        id: m.id,
        title: m.title,
        threshold: m.threshold,
        status: m.status,
        agree: m.agree,
        against: m.against,
      }))
    : [];

  return NextResponse.json({
    meeting: {
      id: detail.meeting.id,
      title: detail.meeting.title,
      status: detail.meeting.status,
      phase: derivePhase(detail.meeting.status, detail.meeting.starts_at),
      starts_at: detail.meeting.starts_at,
    },
    checked_in: detail.participants.filter((p) => p.checked_in).length,
    total: detail.participants.length,
    current: detail.current
      ? {
          id: detail.current.id,
          position: detail.current.position,
          title: detail.current.title,
          description: detail.current.description,
          motions: curMotions,
        }
      : null,
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
      })),
    })),
  });
}
