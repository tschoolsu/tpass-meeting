import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { getMeeting } from "@/lib/meetings";
import { LiveDisplay } from "@/components/live-display";

export const dynamic = "force-dynamic";

// /display?id=<meetingId> —— 大螢幕投放頁（需求 5，適合投影機的簡潔大字體介面）。
export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  await requireAccess(`/display?id=${id}`);
  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  return <LiveDisplay meetingId={id} />;
}
