import { NextResponse } from "next/server";
import { getSession, isModerator } from "@/lib/auth";
import { canViewMeeting, getMeeting, isParticipant } from "@/lib/meetings";
import { getMotionResults } from "@/lib/agenda";

// GET /api/live/meeting/:id/ballots?motionId=<motionId>
// 結算表決的「每人票」名單，按需載入（C-4）：
// 即時 poll 不再整包帶 ballots，前端只在 motion 進入 closed 時拉一次這個端點。
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) return NextResponse.json({ error: "id 格式不正確" }, { status: 400 });
  const meetingId = Number(raw);

  const motionRaw = new URL(request.url).searchParams.get("motionId") ?? "";
  if (!/^\d{1,9}$/.test(motionRaw)) return NextResponse.json({ error: "motionId 格式不正確" }, { status: 400 });
  const motionId = Number(motionRaw);

  const meeting = await getMeeting(meetingId);
  if (!meeting) return NextResponse.json({ error: "找不到會議" }, { status: 404 });

  // SEC-001：非管理員／非參與人不可讀取即時資料。
  if (!canViewMeeting(meeting, session, isModerator(session), await isParticipant(meetingId, session.email))) {
    return NextResponse.json({ error: "找不到會議" }, { status: 404 });
  }

  const results = await getMotionResults(motionId);
  if (!results) return NextResponse.json({ error: "找不到表決" }, { status: 404 });

  // 只回名單明細；計數仍由 /api/live/meeting/:id 提供。
  return NextResponse.json({ motion_id: results.motion_id, ballots: results.ballots });
}
