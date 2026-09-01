import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { getMeeting } from "@/lib/meetings";
import { getMeetingBallots } from "@/lib/agenda";
import { Badge, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";
import { MeetingLive } from "@/components/meeting-live";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  agree: "同意",
  against: "不同意",
  "": "未投票",
};

const STATUS_CLS: Record<string, string> = {
  agree: "text-primary",
  against: "text-destructive",
  "": "text-muted-foreground/40",
};

// /ballots?meetingId=<id>&grade=<opt> —— 具名投票紀錄（需求 4 公開透明，含年級篩選）。
export default async function BallotsPage({
  searchParams,
}: {
  searchParams: Promise<{ meetingId?: string | string[]; grade?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.meetingId) ? sp.meetingId[0] : sp.meetingId;
  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const meetingId = Number(rawId);
  const gradeFilter = Array.isArray(sp.grade) ? sp.grade[0] : sp.grade;

  await requireAccess(`/ballots?meetingId=${meetingId}`);

  const [meeting, matrix] = await Promise.all([
    getMeeting(meetingId),
    getMeetingBallots(meetingId),
  ]);
  if (!meeting || !matrix) notFound();

  const grades = [...new Set(matrix.participants.map((p) => p.grade).filter(Boolean))].sort();
  const participants = gradeFilter
    ? matrix.participants.filter((p) => p.grade === gradeFilter)
    : matrix.participants;

  return (
    <div className="mx-auto max-w-5xl">
      <MeetingLive meetingId={meetingId} />
      <LinkButton href={`/read?id=${meetingId}`}>
        ← 返回會議
      </LinkButton>

      <h1 className="mt-6 text-2xl font-extrabold">具名投票紀錄</h1>
      <p className="mt-1 text-sm font-medium text-muted-foreground">
        {meeting.title} · 每位應出席學生的投票狀態（同意／不同意／未投票）
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground">年級篩選：</span>
        <LinkButton href={`/ballots?meetingId=${meetingId}`} size="sm" variant={!gradeFilter ? "accent" : "default"}>
          全部
        </LinkButton>
        {grades.map((g) => (
          <LinkButton
            key={g}
            href={`/ballots?meetingId=${meetingId}&grade=${encodeURIComponent(g)}`}
            size="sm"
            variant={gradeFilter === g ? "accent" : "default"}
          >
            {g}
          </LinkButton>
        ))}
      </div>

      {matrix.motions.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm font-medium text-muted-foreground">尚未建立任何表決案。</p>
        </Card>
      ) : (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-foreground">
                <th className="px-3 py-2 text-left font-extrabold">參與人</th>
                {matrix.motions.map((m) => (
                  <th key={m.id} className="px-3 py-2 text-center font-extrabold" title={m.title}>
                    <span className="block max-w-40 truncate">{m.title}</span>
                    <span className="mt-0.5 block text-[10px] font-bold text-muted-foreground">
                      同意 {matrix.counts[m.id]?.agree ?? 0} / 不同意 {matrix.counts[m.id]?.against ?? 0}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.email} className="border-b border-dashed border-foreground/20">
                  <td className="px-3 py-2 font-mono text-xs font-bold">
                    {p.email}
                    {p.grade ? <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">{p.grade}</span> : null}
                  </td>
                  {matrix.motions.map((m) => {
                    const status = matrix.votes[p.email]?.[String(m.id)] ?? "";
                    return (
                      <td key={m.id} className="px-3 py-2 text-center">
                        <Badge className={STATUS_CLS[status] ?? ""}>
                          {STATUS_LABEL[status] ?? "未投票"}
                        </Badge>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={matrix.motions.length + 1} className="px-3 py-4 text-center text-sm text-muted-foreground">
                    沒有符合的參與人。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
