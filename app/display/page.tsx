import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { isAdmin, isModerator, requireAccess } from "@/lib/auth";
import { canViewMeeting, getMeeting, isParticipant } from "@/lib/meetings";
import { LiveDisplay } from "@/components/live-display";
import { meetingMetadata } from "@/lib/page-title";
import { authConfig } from "@/config/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  return meetingMetadata("投放畫面", (await searchParams).id);
}

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

  // 簽到階段投出來的 QR：掃進去就是這場會議的簽到台（沒登入的人由 SSO 接手）。
  // 在 server 端一次產好 SVG，投屏端不必再載任何前端套件。
  const checkinUrl = `${authConfig.selfUrl}/checkin?id=${id}`;
  const checkinQrSvg = await QRCode.toString(checkinUrl, { type: "svg", margin: 1 });

  return (
    <LiveDisplay
      meetingId={id}
      canControl={canControl}
      checkinUrl={checkinUrl}
      checkinQrSvg={checkinQrSvg}
    />
  );
}
