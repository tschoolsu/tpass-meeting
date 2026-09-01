import { notFound } from "next/navigation";
import { isAdmin, isModerator, requireAccess } from "@/lib/auth";
import { canWriteNotes, getMeetingDetail } from "@/lib/meetings";
import { formatTaipei, isStarted } from "@/lib/time";
import { hasBgm } from "@/lib/bgm";
import { liveUrl } from "@/lib/urls";
import { authConfig } from "@/config/auth";
import { NoteBar } from "@/components/note-bar";
import { DeleteMeetingButton } from "@/components/delete-meeting";
import { CopyLinkButton } from "@/components/copy-link";
import { BgmPlayer } from "@/components/bgm-player";
import { AgendaManager } from "@/components/agenda-manager";
import { thLabel } from "@/lib/threshold";
import { derivePhase, motionLabel, PUBLIC_PHASE_META } from "@/lib/meeting-status";
import { ParticipantBulk } from "@/components/participant-bulk";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { VotePopup } from "@/components/vote-popup";
import { Badge, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

const selfUrl = authConfig.selfUrl;

export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;

  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  const session = await requireAccess(`/read?id=${id}`);

  const detail = await getMeetingDetail(id);
  if (!detail) notFound();

  const [bgm] = await Promise.all([hasBgm()]);

  const { meeting, participants, agenda, notes } = detail;
  const isAdminUser = isAdmin(session);
  const canEdit = isAdminUser || meeting.owner_sub === session.sub;
  const isManager = isAdminUser || isModerator(session);
  const isMeParticipant = participants.some((p) => p.email === session.email);
  // 會議紀錄權限：僅創建者（or admin）與被授權協作者可新增/編輯（需求）
  const canNote = await canWriteNotes(meeting, session, isAdminUser);

  const myCheckin = participants.find((p) => p.email === session.email)?.checked_in ?? false;
  const notCheckedIn = participants.filter((p) => !p.checked_in);
  const checkedCount = participants.length - notCheckedIn.length;
  const started = isStarted(meeting.starts_at);
  const phase = derivePhase(meeting.status, meeting.starts_at);

  // 目前有「表決中」的表決案（供使用者立即前往投票）
  const openMotions = agenda.flatMap((a) => a.motions).filter((m) => m.status === "open");
  const pendingMotions = agenda.flatMap((a) => a.motions).filter((m) => m.status === "" && started);

  return (
    <div className="mx-auto max-w-4xl">
      <LiveAutoRefresh meetingId={id} />
      <VotePopup meetingId={id} enabled={isMeParticipant} />
      {bgm ? <BgmPlayer /> : null}
      <LinkButton href="/">← 返回首頁</LinkButton>

      <Card className="mt-6 shadow-[6px_6px_0_0_var(--color-foreground)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {meeting.department ? <Badge className="bg-tone-green-badge">{meeting.department}</Badge> : null}
              <span className="font-mono text-xs font-bold text-muted-foreground">
                {formatTaipei(meeting.starts_at)}（UTC+8）
              </span>
              <Badge className={PUBLIC_PHASE_META[phase].badgeClass}>{PUBLIC_PHASE_META[phase].label}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold leading-snug tracking-tight sm:text-3xl">
              {meeting.department ? <span className="text-tone-green-text">[{meeting.department}] </span> : null}
              {meeting.title}
            </h1>
            <p className="mt-2 text-sm font-medium text-muted-foreground">建立者：{meeting.owner_name}</p>
            {meeting.location ? (
              <p className="mt-1 text-sm font-bold">地點：{meeting.location}</p>
            ) : null}
            {meeting.online_link ? (
              <p className="mt-1 text-sm font-bold">
                線上：<a className="text-primary underline" href={meeting.online_link}>{meeting.online_link}</a>
              </p>
            ) : null}
            {meeting.description ? (
              <p className="mt-3 whitespace-pre-wrap rounded-xl border-2 border-foreground bg-secondary px-3 py-2 text-sm font-medium">
                {meeting.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <LinkButton href={`/create?id=${id}`} variant="accent">編輯</LinkButton>
                <DeleteMeetingButton meetingId={id} title={meeting.title} />
              </>
            ) : null}
            {isManager ? (
              <>
                <LinkButton href={`/chair?id=${id}`} variant="primary">主席控制台</LinkButton>
                <LinkButton href={`/display?id=${id}`}>投放畫面</LinkButton>
                <LinkButton href={`/report?id=${id}`} variant="accent">列印 PDF</LinkButton>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border-2 border-foreground bg-tone-green-bg px-4 py-3">
            <div className="font-mono text-xs font-bold text-tone-green-text">應到人數</div>
            <div className="mt-1 font-mono text-2xl font-extrabold">{participants.length}</div>
          </div>
          <div className="rounded-xl border-2 border-foreground bg-card px-4 py-3">
            <div className="font-mono text-xs font-bold text-muted-foreground">實到（已簽到）</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-tone-green-text">{checkedCount}</div>
          </div>
          <div className="rounded-xl border-2 border-foreground bg-card px-4 py-3">
            <div className="font-mono text-xs font-bold text-muted-foreground">尚未簽到</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-destructive">{notCheckedIn.length}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {isMeParticipant && !myCheckin && started ? (
            <LinkButton href={`/checkin?id=${id}`} variant="primary">前往簽到</LinkButton>
          ) : isMeParticipant && !myCheckin ? (
            <Badge className="bg-accent/10">簽到於 {formatTaipei(meeting.starts_at)} 開始後開放</Badge>
          ) : myCheckin ? (
            <Badge className="bg-tone-green-badge">你已完成簽到</Badge>
          ) : null}

          {openMotions.length > 0 && isMeParticipant ? (
            <LinkButton href={`/vote?id=${openMotions[0].id}`} variant="primary" className="animate-pulse">
              前往表決（進行中）
            </LinkButton>
          ) : openMotions.length === 0 && pendingMotions.length > 0 && isMeParticipant ? (
            <Badge className="bg-accent/10">有 {pendingMotions.length} 項表決待主席開放</Badge>
          ) : null}

          <LinkButton href={`/ballots?meetingId=${id}`}>具名投票紀錄</LinkButton>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-foreground/30 pt-4">
          <span className="text-xs font-bold text-muted-foreground">分享連結：</span>
          <CopyLinkButton url={`${selfUrl}/checkin?id=${id}`} label="複製簽到連結" />
          {isManager ? <CopyLinkButton url={liveUrl(id)} label="複製投放連結" /> : null}
        </div>
      </Card>

      {/* 議程與議案 */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">議程與議案</h2>
        {agenda.length === 0 ? (
          <Card>
            <p className="text-sm font-medium text-muted-foreground">
              尚未建立議程{canEdit ? "，請使用下方管理工具新增。" : "。"}
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {agenda.map((a) => (
              <Card key={a.id}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-extrabold">#{a.position + 1} {a.title}</h3>
                  {a.motions.length > 0 ? <Badge className="bg-tone-green-badge">{a.motions.length} 項表決</Badge> : null}
                </div>
                {a.description ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-muted-foreground">{a.description}</p>
                ) : null}
                {a.attachments.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`${selfUrl}/api/agenda/attachments/${att.id}`}
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
                            <Badge className={m.status === "open" ? "bg-accent" : m.status === "closed" ? "bg-secondary" : "bg-tone-green-badge"}>
                              {motionLabel(m.status)}
                            </Badge>
                          </div>
                        </div>
                        {m.description ? (
                          <p className="mt-1 text-xs font-medium text-muted-foreground">{m.description}</p>
                        ) : null}
                        <div className="mt-2 flex gap-4 font-mono text-sm font-bold">
                          <span className="text-primary">同意 {m.agree}</span>
                          <span className="text-destructive">不同意 {m.against}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}

        {canEdit ? (
          <div className="mt-6">
            <AgendaManager
              meetingId={id}
              agenda={agenda.map((a) => ({
                id: a.id,
                title: a.title,
                description: a.description,
                motions: a.motions.map((m) => ({
                  id: m.id,
                  title: m.title,
                  threshold: m.threshold,
                  status: m.status,
                })),
                attachments: a.attachments.map((x) => ({ id: x.id, filename: x.filename })),
              }))}
            />
          </div>
        ) : null}
      </section>

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
                <span className="font-mono text-sm font-bold">
                  {p.email}
                  {p.grade ? <span className="ml-2 text-xs font-bold text-muted-foreground">[{p.grade}]</span> : null}
                </span>
                {p.checked_in ? (
                  <Badge className="bg-tone-green-badge">已簽到</Badge>
                ) : (
                  <Badge>未簽到</Badge>
                )}
              </li>
            ))}
            {participants.length === 0 ? (
              <li className="py-4 text-center text-sm font-medium text-muted-foreground">尚未邀請任何參與人</li>
            ) : null}
          </ul>
          {notCheckedIn.length > 0 ? (
            <div className="mt-4 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-3">
              <p className="text-sm font-extrabold text-destructive">尚未簽到（{notCheckedIn.length} 人）</p>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {notCheckedIn.map((p) => (
                  <li key={p.email} className="font-mono text-xs font-bold">
                    {p.email}
                  </li>
                ))}
              </ul>
            </div>
          ) : participants.length > 0 ? (
            <p className="mt-4 rounded-xl border-2 border-foreground bg-tone-green-bg px-4 py-3 text-sm font-bold text-tone-green-text">
              所有人都已完成簽到。
            </p>
          ) : null}
          {canEdit ? <ParticipantBulk meetingId={id} /> : null}
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">會議紀錄</h2>
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <Card key={n.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">{n.author_name}</span>
                <span className="font-mono text-[11px] font-bold text-muted-foreground">
                  {formatDateTime(n.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{n.body}</p>
            </Card>
          ))}
          {notes.length === 0 ? (
            <p className="rounded-xl border-2 border-foreground bg-secondary px-4 py-3 text-sm font-medium text-muted-foreground">
              尚無紀錄。
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <NoteBar meetingId={id} canNote={canNote} />
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
