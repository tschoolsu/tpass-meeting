import { NextResponse } from "next/server";
import { getSession, isModerator } from "@/lib/auth";
import { canViewMeeting, getMeetingDetail, type MotionWithCount } from "@/lib/meetings";
import { listMyVotedMotionIds } from "@/lib/agenda";
import { derivePhase } from "@/lib/meeting-status";
import type { LiveMotion, LiveState } from "@/lib/live-state";

// GET /api/live/meeting/:id —— 即時快照，唯一事實來源（投屏、彈窗、自動 refresh 都吃這份）。
// 需登入；參與人與管理者皆可讀取。回傳形狀＝ lib/live-state.ts 的 LiveState。
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) return NextResponse.json({ error: "id 格式不正確" }, { status: 400 });
  const meetingId = Number(raw);

  const detail = await getMeetingDetail(meetingId);
  if (!detail) return NextResponse.json({ error: "找不到會議" }, { status: 404 });

  const me = detail.participants.find((p) => p.email === session.email);
  // SEC-001：非管理員／非參與人不可讀取即時資料。
  if (!canViewMeeting(detail.meeting, session, isModerator(session), me !== undefined)) {
    return NextResponse.json({ error: "找不到會議" }, { status: 404 });
  }
  const votedIds = await listMyVotedMotionIds(meetingId, session.email);

  // C-4：即時端點只回「計數」，已結算案的每人票由前端按需向 /api/live/meeting/:id/ballots 載入一次。
  const curMotions = detail.current ? detail.current.motions.map(toLive) : [];

  const body: LiveState = {
    meeting: {
      id: detail.meeting.id,
      title: detail.meeting.title,
      status: detail.meeting.status,
      phase: derivePhase(detail.meeting.status, detail.meeting.starts_at),
      starts_at: detail.meeting.starts_at,
    },
    checked_in: detail.participants.filter((p) => p.checked_in).length,
    total: detail.participants.length,
    participants: detail.participants.map((p) => ({ email: p.email, name: p.name, grade: p.grade, checked_in: p.checked_in })),
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
      motions: a.motions.map(toLive),
    })),
    me: {
      participant: me !== undefined,
      checked_in: me?.checked_in ?? false,
      voted_motion_ids: votedIds,
    },
  };
  return NextResponse.json(body);
}

function toLive(m: MotionWithCount): LiveMotion {
  return {
    id: m.id,
    agenda_item_id: m.agenda_item_id,
    title: m.title,
    threshold: m.threshold,
    status: m.status,
    agree: m.agree,
    against: m.against,
    present_count: m.present_count,
    expected_count: m.expected_count,
    result: m.result,
  };
}
