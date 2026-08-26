import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { getVoteFlow, isParticipant } from "@/lib/meetings";
import { formatTaipei, isStarted } from "@/lib/time";
import { VoteFlow } from "@/components/vote-flow";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VotePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const session = await requireAccess("/vote");
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;

  // IDOR 防護：只接受正整數格式。
  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const flow = await getVoteFlow(id, session.email);
  if (!flow) notFound();

  if (!(await isParticipant(flow.meeting.id, session.email))) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center">
        <Card className="w-full text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
          <p className="font-mono text-4xl font-extrabold tracking-tighter text-primary">沒權限</p>
          <h1 className="mt-3 text-xl font-extrabold">你未被邀請參與這場會議的表決</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            只有被會議邀請的人才能參與表決。
          </p>
          <Link
            href={`/read?id=${flow.meeting.id}`}
            className="mt-6 inline-flex rounded-xl border-2 border-foreground bg-accent/10 px-5 py-2.5 font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            ← 返回會議
          </Link>
        </Card>
      </div>
    );
  }

  if (!isStarted(flow.meeting.starts_at)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center">
        <Card className="w-full text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
          <p className="font-mono text-4xl font-extrabold tracking-tighter text-accent">等待開始</p>
          <h1 className="mt-3 text-xl font-extrabold">表決尚未開放</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            會議將於 {formatTaipei(flow.meeting.starts_at)}（UTC+8）開始，開始後才能進行表決。
          </p>
          <Link
            href={`/read?id=${flow.meeting.id}`}
            className="mt-6 inline-flex rounded-xl border-2 border-foreground bg-accent/10 px-5 py-2.5 font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            ← 返回會議
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <VoteFlow
        voteId={flow.vote.id}
        meetingId={flow.meeting.id}
        meetingTitle={flow.meeting.title}
        questions={flow.questions.map((q) => ({ id: q.id, question: q.question }))}
        answeredIds={[...flow.answered]}
      />
    </div>
  );
}
