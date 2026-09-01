import { notFound } from "next/navigation";
import { isAdmin, isModerator, requireAccess } from "@/lib/auth";
import { canViewMeeting, getMeeting, isParticipant } from "@/lib/meetings";
import { LiveDisplay } from "@/components/live-display";

export const dynamic = "force-dynamic";

// /display?id=<meetingId> —— 大螢幕投放頁（需求 5，適合投影機的簡潔大字體介面）。
// 建立者／admin 登入時多一條可收合的主席控制列；其他人畫面不變。
export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  if (!rawId || !/^\d{1,9}$/.test(rawId)) notFound();
  const id = Number(rawId);

  const session = await requireAccess(`/display?id=${id}`);
  const meeting = await getMeeting(id);
  if (!meeting) notFound();
  // SEC-001：非管理員／非參與人不可觀看投放畫面。
  if (!canViewMeeting(meeting, session, isModerator(session), await isParticipant(id, session.email))) {
    notFound();
  }
  const canControl = isAdmin(session) || meeting.owner_sub === session.sub;

  return <LiveDisplay meetingId={id} canControl={canControl} />;
}
