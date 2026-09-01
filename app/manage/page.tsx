import { notFound } from "next/navigation";
import { isAdmin, requireManager } from "@/lib/auth";
import { getMeetingDetail, listMeetingEditors } from "@/lib/meetings";
import { notificationStats } from "@/lib/email";
import { authConfig } from "@/config/auth";
import { serviceConfig } from "@/config/service";
import { listDepartments } from "@/lib/departments";
import { Forbidden } from "@/components/forbidden";
import { MeetingWorkbench } from "@/components/manage/meeting-workbench";
import { MeetingLive } from "@/components/meeting-live";

export const dynamic = "force-dynamic";

// /manage?id=<meetingId> —— 建立者／管理員的工作台。守門 + 一次撈齊資料，UI 在 MeetingWorkbench。
export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const session = await requireManager(`/manage?id=${id}`);
  const detail = await getMeetingDetail(id);
  if (!detail) notFound();
  if (!isAdmin(session) && detail.meeting.owner_sub !== session.sub) {
    return <Forbidden message="只有這場會議的建立者或管理員可以進入工作台。" />;
  }

  const [editors, stats, departments] = await Promise.all([listMeetingEditors(id), notificationStats(id), listDepartments()]);
  const notify = { sent: 0, pending: 0, failed: 0 };
  for (const r of stats) {
    if (r.status === "sent") notify.sent += r.cnt;
    else if (r.status === "pending") notify.pending += r.cnt;
    else notify.failed += r.cnt;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <MeetingLive meetingId={id} />
      <MeetingWorkbench
        detail={detail}
        editors={editors}
        notify={notify}
        emailEnabled={serviceConfig.smtp !== null}
        checkinUrl={`${authConfig.selfUrl}/checkin?id=${id}`}
        departments={departments}
      />
    </div>
  );
}
