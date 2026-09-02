// /read?id=<meetingId> —— 會議頁（純閱讀）。所有人看到同一份內容；差別只在最上面那一顆按鈕：
// 學生依 phase 拿到「簽到／表決／等待」其中之一，建立者拿到「管理這場會議」。
// 管理工具一律在 /manage，這裡不放。
import { notFound } from "next/navigation";
import { isAdmin, isModerator, requireAccess } from "@/lib/auth";
import { canViewMeeting, canWriteNotes, getMeetingDetail } from "@/lib/meetings";
import { canDeleteNote } from "@/lib/note-permissions";
import { formatTaipei } from "@/lib/time";
import { bgmInfo } from "@/lib/bgm";
import { authConfig } from "@/config/auth";
import { thLabel } from "@/lib/threshold";
import { displayName } from "@/lib/names";
import { MotionOutcomeLine } from "@/components/motion-outcome";
import { derivePhase, motionLabel, primaryCtaFor, PUBLIC_PHASE_META } from "@/lib/meeting-status";
import { NoteBar } from "@/components/note-bar";
import { DeleteNoteButton } from "@/components/delete-note";
import { BgmPlayer } from "@/components/bgm-player";
import { MeetingLive } from "@/components/meeting-live";
import { meetingMetadata } from "@/lib/page-title";
import { Badge, Card, RichText } from "tpass-ui";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  return meetingMetadata("會議", (await searchParams).id);
}

export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  if (!rawId || !/^\d{1,9}$/.test(rawId)) notFound();
  const id = Number(rawId);

  const session = await requireAccess(`/read?id=${id}`);
  const detail = await getMeetingDetail(id);
  if (!detail) notFound();
  const bgm = await bgmInfo();

  const { meeting, participants, agenda, notes } = detail;
  const isAdminUser = isAdmin(session);
  const canEdit = isAdminUser || meeting.owner_sub === session.sub;
  const me = participants.find((p) => p.email === session.email);
  // SEC-001：一般學生僅能讀取自己受邀的會議；非參與人一律 404。
  if (!canViewMeeting(meeting, session, isAdminUser || isModerator(session), me !== undefined)) notFound();
  // 協作者在這裡寫紀錄；建立者的 NoteBar 在工作台 ④，不重複放。
  const showNoteBar = !canEdit && (await canWriteNotes(meeting, session, isAdminUser));

  const phase = derivePhase(meeting.status, meeting.starts_at);
  const motions = agenda.flatMap((a) => a.motions);
  const openMotion = motions.find((m) => m.status === "open") ?? null;
  const checkedCount = participants.filter((p) => p.checked_in).length;

  const cta = primaryCtaFor({
    phase,
    meetingId: id,
    isParticipant: me !== undefined,
    checkedIn: me?.checked_in ?? false,
    openMotionId: openMotion?.id ?? null,
    startsAtLabel: formatTaipei(meeting.starts_at),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <MeetingLive meetingId={id} />
      {bgm ? <BgmPlayer version={bgm.updated_at} /> : null}
      <LinkButton href="/">← 返回首頁</LinkButton>

      <Card className="mt-6 shadow-[6px_6px_0_0_var(--color-foreground)]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PUBLIC_PHASE_META[phase].badgeClass}>{PUBLIC_PHASE_META[phase].label}</Badge>
          {meeting.department ? <Badge className="bg-tone-green-badge">{meeting.department}</Badge> : null}
          <span className="font-mono text-xs font-bold text-muted-foreground">{formatTaipei(meeting.starts_at)}（UTC+8）</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold leading-snug tracking-tight sm:text-3xl">{meeting.title}</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">建立者：{meeting.owner_name}</p>
        {meeting.location ? <p className="mt-1 text-sm font-bold">地點：{meeting.location}</p> : null}
        {meeting.online_link ? (
          <p className="mt-1 text-sm font-bold">
            線上：
            <a className="text-primary underline" href={meeting.online_link}>
              {meeting.online_link}
            </a>
          </p>
        ) : null}
        {meeting.description ? (
          <div className="mt-3 whitespace-pre-wrap rounded-xl border-2 border-foreground bg-secondary px-3 py-2 text-sm font-medium">
            <RichText text={meeting.description} />
          </div>
        ) : null}

        {/* 唯一的主要動作 */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t-2 border-dashed border-foreground/30 pt-4">
          {canEdit ? (
            <>
              <LinkButton href={`/manage?id=${id}`} variant="primary">
                管理這場會議
              </LinkButton>
              {phase === "live" ? (
                <LinkButton href={`/chair?id=${id}`} size="sm">
                  主席控制台
                </LinkButton>
              ) : null}
            </>
          ) : cta?.kind === "link" ? (
            <LinkButton href={cta.href} variant="primary" className={cta.pulse ? "animate-pulse" : undefined}>
              {cta.label}
            </LinkButton>
          ) : cta?.kind === "note" ? (
            <p className="text-sm font-bold text-muted-foreground">{cta.text}</p>
          ) : null}
          {me?.checked_in ? <Badge className="bg-tone-green-badge">你已完成簽到</Badge> : null}
          {motions.length > 0 ? (
            <LinkButton href={`/ballots?meetingId=${id}`} size="sm" className="ml-auto">
              投票紀錄
            </LinkButton>
          ) : null}
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">議程</h2>
        {agenda.length === 0 ? (
          <Card>
            <p className="text-sm font-medium text-muted-foreground">主辦尚未建立議程。</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {agenda.map((a) => (
              <Card key={a.id}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-extrabold">
                    #{a.position + 1} {a.title}
                  </h3>
                  {a.motions.length > 0 ? <Badge className="bg-tone-green-badge">{a.motions.length} 案表決</Badge> : null}
                </div>
                {a.description ? <div className="mt-2 whitespace-pre-wrap text-sm font-medium text-muted-foreground"><RichText text={a.description} /></div> : null}
                {a.attachments.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`${authConfig.selfUrl}/api/agenda/attachments/${att.id}`}
                        download
                        className="inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-secondary px-2.5 py-1 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-colors hover:bg-muted"
                      >
                        ⬇ {att.filename}
                      </a>
                    ))}
                  </div>
                ) : null}
                {a.motions.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {a.motions.map((m) => (
                      <div key={m.id} className="rounded-xl border-2 border-foreground bg-tone-green-bg px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-extrabold">{m.title}</p>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-secondary">{thLabel(m.threshold)}</Badge>
                            <Badge className={m.status === "open" ? "bg-tone-green-badge text-tone-green-text" : m.status === "closed" ? "bg-secondary" : "bg-card"}>
                              {motionLabel(m.status)}
                            </Badge>
                          </div>
                        </div>
                        {m.description ? <div className="mt-1 whitespace-pre-wrap text-xs font-medium text-muted-foreground"><RichText text={m.description} /></div> : null}
                        {m.status !== "" ? (
                          <div className="mt-2 space-y-1">
                            <div className="flex gap-4 font-mono text-sm font-bold">
                              <span className="text-primary">同意 {m.agree}</span>
                              <span className="text-destructive">不同意 {m.against}</span>
                            </div>
                            <MotionOutcomeLine motion={m} live={{ present: checkedCount }} />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <Card>
          <details>
            <summary className="cursor-pointer text-base font-extrabold">
              出席名單
              <span className="ml-2 font-mono text-xs font-bold text-muted-foreground">
                已簽到 {checkedCount}／{participants.length}
              </span>
            </summary>
            <ul className="mt-3 divide-y-2 divide-dashed divide-foreground/15">
              {participants.map((p) => (
                <li key={p.email} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm font-bold" title={p.email}>
                    {displayName(p)}
                    {p.grade ? <span className="ml-2 font-mono text-xs font-bold text-muted-foreground">[{p.grade}]</span> : null}
                  </span>
                  {p.checked_in ? <Badge className="bg-tone-green-badge">已簽到</Badge> : <Badge>未簽到</Badge>}
                </li>
              ))}
              {participants.length === 0 ? <li className="py-3 text-sm font-medium text-muted-foreground">尚未邀請任何參與人。</li> : null}
            </ul>
          </details>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">會議紀錄</h2>
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <Card key={n.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">{n.author_name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-muted-foreground">{formatTaipei(n.created_at)}</span>
                  {canDeleteNote(n, meeting, session, isAdminUser) ? <DeleteNoteButton meetingId={id} noteId={n.id} /> : null}
                </div>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed"><RichText text={n.body} /></div>
            </Card>
          ))}
          {notes.length === 0 ? (
            <p className="rounded-xl border-2 border-foreground bg-secondary px-4 py-3 text-sm font-medium text-muted-foreground">尚無紀錄。</p>
          ) : null}
        </div>
        {showNoteBar ? (
          <div className="mt-5">
            <NoteBar meetingId={id} canNote />
          </div>
        ) : null}
      </section>
    </div>
  );
}
