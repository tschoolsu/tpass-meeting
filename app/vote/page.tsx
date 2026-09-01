import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { getCheckInState, isParticipant } from "@/lib/meetings";
import { getMotion, getMotionFlow } from "@/lib/agenda";
import { formatTaipei, isStarted } from "@/lib/time";
import { MotionVote } from "@/components/motion-vote";
import { MeetingLive } from "@/components/meeting-live";
import { motionMetadata } from "@/lib/page-title";
import { Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  return motionMetadata("表決", (await searchParams).id);
}

// /vote?id=<motionId> —— 單一表決案的具名投票頁（需求 3、4）。
export default async function VotePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;

  if (!rawId || !/^\d{1,9}$/.test(rawId)) notFound();
  const motionId = Number(rawId);

  const session = await requireAccess(`/vote?id=${motionId}`);

  const motion = await getMotion(motionId);
  if (!motion) notFound();

  const flow = await getMotionFlow(motionId, session.email);
  if (!flow) notFound();

  const meeting = flow.meeting;
  if (!(await isParticipant(meeting.id, session.email))) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center">
        <Card className="w-full text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
          <p className="font-mono text-4xl font-extrabold tracking-tighter text-primary">沒權限</p>
          <h1 className="mt-3 text-xl font-extrabold">你未被邀請參與這場會議的表決</h1>
          <LinkButton href={`/read?id=${meeting.id}`} className="mt-6">
            ← 返回會議
          </LinkButton>
        </Card>
      </div>
    );
  }

  if (!isStarted(meeting.starts_at)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center">
        <Card className="w-full text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
          <p className="font-mono text-4xl font-extrabold tracking-tighter text-accent">等待開始</p>
          <h1 className="mt-3 text-xl font-extrabold">表決尚未到開放時間</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            會議將於 {formatTaipei(meeting.starts_at)}（UTC+8）開始，開始後主席會開放表決。
          </p>
          <LinkButton href={`/read?id=${meeting.id}`} className="mt-6">
            ← 返回會議
          </LinkButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col justify-center py-8">
      <MeetingLive meetingId={meeting.id} refresh={false} excludeMotionId={motionId} />
      <MotionVote
        meetingId={meeting.id}
        motionId={motionId}
        initialStatus={flow.motion.status}
        initialAnswered={flow.answered}
        initialCheckedIn={await getCheckInState(meeting.id, session.email)}
      />
    </div>
  );
}
