import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, isModerator, requireAccess } from "@/lib/auth";
import {
  countUnanswered,
  getMeetingDetail,
  getMyAnsweredQuestionIds,
} from "@/lib/meetings";
import { formatDate } from "@/components/meeting-card";
import { PieChart } from "@/components/pie-chart";
import { NoteBar } from "@/components/note-bar";
import { DeleteMeetingButton } from "@/components/delete-meeting";
import { CopyLinkButton } from "@/components/copy-link";
import { BtnLink, Card, Tag } from "@/components/ui";

export const dynamic = "force-dynamic";

const selfUrl = process.env.SERVICE_SELF_URL || "https://meeting.tschoolsu.org";

export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const session = await requireAccess("/");
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;

  // IDOR 防護：只接受正整數格式的會議 id，不接受任何其他輸入。
  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const detail = await getMeetingDetail(id);
  if (!detail) notFound();

  const { meeting, participants, notes } = detail;
  const vote = detail.vote;
  const isAdminUser = isAdmin(session);
  const canEdit = isAdminUser || meeting.owner_sub === session.sub;
  const isMeParticipant = participants.some((p) => p.email === session.email);
  const canVote = isMeParticipant;

  const myCheckin = participants.find((p) => p.email === session.email)?.checked_in ?? false;
  const notCheckedIn = participants.filter((p) => !p.checked_in);
  const checkedCount = participants.length - notCheckedIn.length;

  const [unanswered, myAnswered] = meeting.voting_enabled && canVote && vote
    ? await Promise.all([
        countUnanswered(id, session.email),
        getMyAnsweredQuestionIds(id, session.email),
      ])
    : [0, new Set<number>()];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3.5 py-2 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)]"
      >
        ← 返回首頁
      </Link>

      <Card className="mt-6 shadow-[6px_6px_0_0_var(--color-foreground)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {meeting.department ? <Tag className="bg-tone-badge">{meeting.department}</Tag> : null}
              <span className="font-mono text-xs font-bold text-muted-foreground">
                {formatDate(meeting.meeting_date)}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold leading-snug tracking-tight sm:text-3xl">
              {meeting.department ? <span className="text-tone-text">[{meeting.department}] </span> : null}
              {meeting.title}
            </h1>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              建立者：{meeting.owner_name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <BtnLink href={`/create?id=${id}`} variant="accent">
                  編輯
                </BtnLink>
                <DeleteMeetingButton meetingId={id} title={meeting.title} />
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border-2 border-foreground bg-tone-bg px-4 py-3">
            <div className="font-mono text-xs font-bold text-tone-text">簽到人數</div>
            <div className="mt-1 font-mono text-2xl font-extrabold">{checkedCount}</div>
          </div>
          <div className="rounded-xl border-2 border-foreground bg-card px-4 py-3">
            <div className="font-mono text-xs font-bold text-muted-foreground">尚未簽到</div>
            <div className="mt-1 font-mono text-2xl font-extrabold">{notCheckedIn.length}</div>
          </div>
          <div className="rounded-xl border-2 border-foreground bg-card px-4 py-3">
            <div className="font-mono text-xs font-bold text-muted-foreground">參與人</div>
            <div className="mt-1 font-mono text-2xl font-extrabold">{participants.length}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {isMeParticipant && !myCheckin ? (
            <BtnLink href={`/checkin?id=${id}`} variant="primary">
              前往簽到
            </BtnLink>
          ) : myCheckin ? (
            <Tag className="bg-tone-badge">你已完成簽到</Tag>
          ) : null}

          {meeting.voting_enabled && canVote && vote && unanswered > 0 ? (
            <BtnLink href={`/vote?id=${vote.id}`} variant="primary">
              前往表決（尚有 {unanswered} 題）
            </BtnLink>
          ) : meeting.voting_enabled && canVote && vote ? (
            <Tag className="bg-tone-badge">你已完成所有表決</Tag>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-foreground/30 pt-4">
          <span className="text-xs font-bold text-muted-foreground">分享連結：</span>
          <CopyLinkButton url={`${selfUrl}/checkin?id=${id}`} label="複製簽到連結" />
          {vote ? (
            <CopyLinkButton url={`${selfUrl}/vote?id=${vote.id}`} label="複製表決連結" />
          ) : null}
        </div>
      </Card>

      {meeting.voting_enabled && vote ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold">表決結果</h2>
          <div className="flex flex-col gap-4">
            {vote.questions.map((v) => (
              <PieChart
                key={v.id}
                title={v.question}
                yes={v.yes}
                no={v.no}
                answeredByMe={myAnswered.has(v.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">
          參與人
          <span className="ml-2 font-mono text-xs font-bold text-muted-foreground">
            已簽到 {checkedCount}／{participants.length}
          </span>
        </h2>
        <Card>
          <ul className="divide-y-2 divide-dashed divide-foreground/15">
            {participants.map((p) => (
              <li key={p.email} className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-mono text-sm font-bold">{p.email}</span>
                {p.checked_in ? (
                  <Tag className="bg-tone-badge">已簽到</Tag>
                ) : (
                  <Tag>未簽到</Tag>
                )}
              </li>
            ))}
            {participants.length === 0 ? (
              <li className="py-4 text-center text-sm font-medium text-muted-foreground">
                尚未邀請任何參與人
              </li>
            ) : null}
          </ul>

          {notCheckedIn.length > 0 ? (
            <div className="mt-4 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-3">
              <p className="text-sm font-extrabold text-destructive">
                尚未簽到（{notCheckedIn.length} 人）
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {notCheckedIn.map((p) => (
                  <li key={p.email} className="font-mono text-xs font-bold">
                    {p.email}
                  </li>
                ))}
              </ul>
            </div>
          ) : participants.length > 0 ? (
            <p className="mt-4 rounded-xl border-2 border-foreground bg-tone-bg px-4 py-3 text-sm font-bold text-tone-text">
              所有人都已完成簽到。
            </p>
          ) : null}
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">會議紀錄</h2>
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">{n.author_name}</span>
                <span className="font-mono text-[11px] font-bold text-muted-foreground">
                  {formatDateTime(n.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{n.body}</p>
            </div>
          ))}
          {notes.length === 0 ? (
            <p className="rounded-xl border-2 border-foreground bg-secondary px-4 py-3 text-sm font-medium text-muted-foreground">
              尚無紀錄。
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <NoteBar meetingId={id} canNote={isAdminUser || isModerator(session) || isMeParticipant} />
        </div>
      </section>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
