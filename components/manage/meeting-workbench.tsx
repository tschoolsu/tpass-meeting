// 工作台版面組裝：標題列 + 進度列 + 「現在該做什麼」+ 四格手風琴。
// 所有資料由 app/manage/page.tsx 一次撈好當 props 傳入；這裡只做版面與 UI 狀態，
// mutation 一律呼叫既有 server action（在各面板內）。
import { Badge, Card } from "tpass-ui";
import type { MeetingDetail, MeetingEditor } from "@/lib/meetings";
import { formatTaipei } from "@/lib/time";
import { MANAGE_PHASE_META, derivePhase, type WorkbenchCounts } from "@/lib/meeting-status";
import { StageProgress } from "@/components/manage/stage-progress";
import { CurrentStageCard, type NotifyStats } from "@/components/manage/current-stage-card";
import { WorkbenchAccordion, type WorkbenchSection } from "@/components/manage/workbench-accordion";
import { LinkButton } from "@/components/link-button";
import { AgendaManager } from "@/components/agenda-manager";
import { BasicsPanel } from "@/components/manage/basics-panel";
import { ParticipantsPanel } from "@/components/manage/participants-panel";
import { NoteBar } from "@/components/note-bar";

export function MeetingWorkbench({
  detail,
  editors,
  notify,
  emailEnabled,
  checkinUrl,
  departments,
}: {
  detail: MeetingDetail;
  editors: MeetingEditor[];
  notify: NotifyStats;
  emailEnabled: boolean;
  checkinUrl: string;
  departments: string[];
}) {
  const { meeting, participants, agenda, notes } = detail;
  const phase = derivePhase(meeting.status, meeting.starts_at);
  const motions = agenda.flatMap((a) => a.motions);
  const counts: WorkbenchCounts = {
    participants: participants.length,
    checkedIn: participants.filter((p) => p.checked_in).length,
    agenda: agenda.length,
    motions: motions.length,
    openMotions: motions.filter((m) => m.status === "open").length,
    closedMotions: motions.filter((m) => m.status === "closed").length,
    notes: notes.length,
    editors: editors.length,
  };

  const sections: WorkbenchSection[] = [
    {
      key: "basics",
      title: "基本資料",
      summary: `${formatTaipei(meeting.starts_at)}${meeting.location ? `・${meeting.location}` : ""}${meeting.department ? `・${meeting.department}` : ""}`,
      content: <BasicsPanel meeting={meeting} phase={phase} departments={departments} />,
    },
    {
      key: "participants",
      title: "參與人",
      summary: `${participants.length} 人・已簽到 ${counts.checkedIn}`,
      content: <ParticipantsPanel meetingId={meeting.id} participants={participants} />,
    },
    {
      key: "agenda",
      title: "議程與表決案",
      summary: `${agenda.length} 項議程・${motions.length} 案表決`,
      content: <AgendaManager meetingId={meeting.id} agenda={agenda.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        motions: a.motions.map((m) => ({ id: m.id, title: m.title, threshold: m.threshold, status: m.status })),
        attachments: a.attachments.map((x) => ({ id: x.id, filename: x.filename })),
      }))} />,
    },
    {
      key: "notes",
      title: "會議紀錄與協作者",
      summary: `${notes.length} 則紀錄・${editors.length} 位協作者`,
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {notes.map((n) => (
              <Card key={n.id} className="p-4 shadow-[2px_2px_0_0_var(--color-foreground)]">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold">{n.author_name}</span>
                  <span className="font-mono text-[11px] font-bold text-muted-foreground">{formatTaipei(n.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{n.body}</p>
              </Card>
            ))}
            {notes.length === 0 ? <p className="text-sm font-medium text-muted-foreground">尚無紀錄。</p> : null}
          </div>
          <NoteBar meetingId={meeting.id} canNote />
          <div>
            <p className="text-sm font-extrabold">協作者（可寫紀錄、可代簽到）</p>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {editors.map((e) => (
                <Badge key={e.email}>{e.email}</Badge>
              ))}
              {editors.length === 0 ? <li className="text-sm font-medium text-muted-foreground">尚未授權任何人。</li> : null}
            </ul>
          </div>
        </div>
      ),
    },
  ];

  const defaultOpen =
    phase === "draft" ? [participants.length === 0 ? "participants" : "agenda"] : phase === "closed" ? ["notes"] : ["agenda"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={MANAGE_PHASE_META[phase].badgeClass}>{MANAGE_PHASE_META[phase].label}</Badge>
            {meeting.department ? <Badge className="bg-tone-green-badge">{meeting.department}</Badge> : null}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold leading-snug tracking-tight sm:text-3xl">{meeting.title}</h1>
          <p className="mt-1 font-mono text-xs font-bold text-muted-foreground">{formatTaipei(meeting.starts_at)}（UTC+8）</p>
        </div>
        <LinkButton href={`/read?id=${meeting.id}`} size="sm">
          看會議頁
        </LinkButton>
      </div>

      <StageProgress phase={phase} />

      <CurrentStageCard
        meetingId={meeting.id}
        phase={phase}
        counts={counts}
        startsAtLabel={formatTaipei(meeting.starts_at)}
        emailEnabled={emailEnabled}
        notify={notify}
        checkinUrl={checkinUrl}
      />

      <WorkbenchAccordion sections={sections} phase={phase} defaultOpen={defaultOpen} />
    </div>
  );
}
