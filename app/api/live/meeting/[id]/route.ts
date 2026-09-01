import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/meetings";
import { getMotionResults, listMyVotedMotionIds } from "@/lib/agenda";
import { derivePhase } from "@/lib/meeting-status";
import type { LiveState } from "@/lib/live-state";

// GET /api/live/meeting/:id —— 即時快照，唯一事實來源（投屏、彈窗、自動 refresh 都吃這份）。
// 需登入；參與人與管理者皆可讀取。回傳形狀＝ lib/live-state.ts 的 LiveState。
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) return NextResponse.json({ error: "id 格式不正確" }, { status: 400 });
  const meetingId = Number(raw);

  const detail = await getMeetingDetail(meetingId);
  if (!detail) return NextResponse.json({ error: "找不到會議" }, { status: 404 });

  const me = detail.participants.find((p) => p.email === session.email);
  const votedIds = await listMyVotedMotionIds(meetingId, session.email);

  // 現行議程各表決案：已結算的附上每人票（投屏「各人意見」用）
  const curMotions = detail.current
    ? await Promise.all(
        detail.current.motions.map(async (m) => ({
          ...toLive(m),
          ballots: m.status === "closed" ? ((await getMotionResults(m.id))?.ballots ?? []) : [],
        })),
      )
    : [];

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

function toLive(m: { id: number; agenda_item_id: number; title: string; threshold: string; status: string; agree: number; against: number }) {
  return {
    id: m.id,
    agenda_item_id: m.agenda_item_id,
    title: m.title,
    threshold: m.threshold,
    status: m.status,
    agree: m.agree,
    against: m.against,
  };
}
