import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { getMeeting, getMeetingDetail, isParticipant } from "@/lib/meetings";
import { CheckinButton } from "@/components/checkin-button";
import { formatDate } from "@/components/meeting-card";
import { Card, Tag } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const session = await requireAccess("/checkin");
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;

  // IDOR 防護：只接受正整數格式。
  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  const invited = await isParticipant(id, session.email);
  if (!invited) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center">
        <Card className="w-full text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
          <p className="font-mono text-4xl font-extrabold tracking-tighter text-primary">沒權限</p>
          <h1 className="mt-3 text-xl font-extrabold">你未被邀請參與這場會議</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            只有被會議邀請的人才能簽到。請聯絡會議建立者確認邀請名單。
          </p>
          <Link
            href={`/read?id=${id}`}
            className="mt-6 inline-flex rounded-xl border-2 border-foreground bg-accent/10 px-5 py-2.5 font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            ← 返回會議
          </Link>
        </Card>
      </div>
    );
  }

  const myCheckin = invited
    ? (await getMeetingDetail(id))?.participants.find((p) => p.email === session.email)?.checked_in ?? false
    : false;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center">
      <Link
        href={`/read?id=${id}`}
        className="mb-8 inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3.5 py-2 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
      >
        ← 返回會議
      </Link>

      <Card className="w-full py-10 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {meeting.department ? <Tag className="bg-tone-badge">{meeting.department}</Tag> : null}
          <span className="font-mono text-xs font-bold text-muted-foreground">
            {formatDate(meeting.meeting_date)}
          </span>
        </div>
        <h2 className="px-4 text-lg font-extrabold leading-snug">{meeting.title}</h2>
        <div className="mt-8">
          <CheckinButton meetingId={id} name={session.name} initialCheckedIn={myCheckin} />
        </div>
      </Card>
    </div>
  );
}
