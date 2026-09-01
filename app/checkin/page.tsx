import { notFound } from "next/navigation";
import { isAdmin, requireAccess } from "@/lib/auth";
import { canWriteNotes, getCheckInState, getMeeting, getMeetingDetail, isParticipant } from "@/lib/meetings";
import { CheckinButton } from "@/components/checkin-button";
import { StaffCheckin } from "@/components/staff-checkin";
import { formatTaipei, isStarted } from "@/lib/time";
import { Badge, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";
import { MeetingLive } from "@/components/meeting-live";

export const dynamic = "force-dynamic";

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;

  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const session = await requireAccess(`/checkin?id=${id}`);

  const [meeting, detail] = await Promise.all([getMeeting(id), getMeetingDetail(id)]);
  if (!meeting || !detail) notFound();

  const invited = await isParticipant(id, session.email);
  const started = isStarted(meeting.starts_at);
  // 代簽到面板：admin、建立者、或被授權的協作者（與 staffCheckInAction 的檢查一致）。
  const canStaff = await canWriteNotes(meeting, session, isAdmin(session));

  return (
    <div className="mx-auto max-w-lg">
      <MeetingLive meetingId={id} />
      <LinkButton href={`/read?id=${id}`} className="mb-8">
        ← 返回會議
      </LinkButton>

      {invited && started ? (
        <Card className="w-full py-10 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            {meeting.department ? <Badge className="bg-tone-green-badge">{meeting.department}</Badge> : null}
            <span className="font-mono text-xs font-bold text-muted-foreground">
              {formatTaipei(meeting.starts_at)}
            </span>
          </div>
          <h2 className="px-4 text-lg font-extrabold leading-snug">{meeting.title}</h2>
          <div className="mt-8">
            <CheckinButton
              meetingId={id}
              name={session.name}
              initialCheckedIn={await getCheckInState(id, session.email)}
            />
          </div>
        </Card>
      ) : invited && !started ? (
        <Card className="w-full py-10 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
          <p className="font-mono text-4xl font-extrabold tracking-tighter text-accent">等待開始</p>
          <h1 className="mt-3 text-xl font-extrabold">簽到尚未開放</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            會議將於 {formatTaipei(meeting.starts_at)}（UTC+8）開始後才能簽到。
          </p>
        </Card>
      ) : (
        <Card className="w-full py-10 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
          <p className="font-mono text-4xl font-extrabold tracking-tighter text-primary">沒權限</p>
          <h1 className="mt-3 text-xl font-extrabold">你未被邀請參與這場會議</h1>
        </Card>
      )}

      {canStaff ? (
        <div className="mt-8">
          <StaffCheckin
            meetingId={id}
            participants={detail.participants.map((p) => ({
              email: p.email,
              grade: p.grade,
              checked_in: p.checked_in,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}
