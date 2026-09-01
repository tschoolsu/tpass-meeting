"use client";

// 「現在該做什麼」卡：依 phase 顯示前置檢查 → 後果 → 唯一一顆 primary。
// 沒有按鈕可按的階段只給一句指引；同一顆按鈕不會在別的地方再出現一次。
// 只綁 setMeetingStatusAction；其他 mutation 都在各自的面板。
import { Card } from "tpass-ui";
import { setMeetingStatusAction } from "@/lib/actions";
import {
  isPublishBlocked,
  publishPrecheck,
  type MeetingPhase,
  type WorkbenchCounts,
} from "@/lib/meeting-status";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { CopyLinkButton } from "@/components/copy-link";
import { LinkButton } from "@/components/link-button";

export interface NotifyStats {
  sent: number;
  pending: number;
  failed: number;
}

export function CurrentStageCard({
  meetingId,
  phase,
  counts,
  startsAtLabel,
  emailEnabled,
  notify,
  checkinUrl,
}: {
  meetingId: number;
  phase: MeetingPhase;
  counts: WorkbenchCounts;
  startsAtLabel: string;
  emailEnabled: boolean;
  notify: NotifyStats;
  checkinUrl: string;
}) {
  return (
    <Card className="shadow-[6px_6px_0_0_var(--color-foreground)]">
      <p className="font-mono text-xs font-bold text-muted-foreground">現在該做什麼</p>
      {phase === "draft" ? <DraftStage meetingId={meetingId} counts={counts} emailEnabled={emailEnabled} /> : null}
      {phase === "scheduled" ? (
        <ScheduledStage counts={counts} startsAtLabel={startsAtLabel} notify={notify} checkinUrl={checkinUrl} />
      ) : null}
      {phase === "live" ? <LiveStage meetingId={meetingId} counts={counts} /> : null}
      {phase === "closed" ? <ClosedStage meetingId={meetingId} counts={counts} /> : null}
    </Card>
  );
}

function Checklist({ items }: { items: { label: string; ok: boolean; detail?: string }[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-start gap-2 text-sm font-bold">
          <span aria-hidden className={i.ok ? "text-tone-green-text" : "text-destructive"}>
            {i.ok ? "✓" : "✗"}
          </span>
          <span>
            {i.label}
            {i.detail ? <span className="ml-2 font-medium text-muted-foreground">{i.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Facts({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm font-bold">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function DraftStage({ meetingId, counts, emailEnabled }: { meetingId: number; counts: WorkbenchCounts; emailEnabled: boolean }) {
  const items = publishPrecheck(counts);
  const blocked = isPublishBlocked(items);
  return (
    <>
      <h2 className="mt-1 text-xl font-extrabold">補齊資料，然後發布</h2>
      <Checklist items={items} />
      <p className="mt-4 text-sm font-medium text-muted-foreground">
        {emailEnabled
          ? `發布後會立刻寄通知信給 ${counts.participants} 位參與人，並開放他們在會議頁看到這場會議。`
          : "發布後參與人就能在會議頁看到這場會議。（尚未設定 SMTP，這次不會寄通知信。）"}
      </p>
      <div className="mt-4">
        <ConfirmActionButton
          variant="primary"
          label="發布並通知"
          pendingLabel="發布中…"
          disabled={blocked}
          action={() => setMeetingStatusAction(meetingId, "published")}
          confirm={{
            title: "確定要發布這場會議嗎？",
            description: emailEnabled
              ? `會立刻寄出 ${counts.participants} 封通知信，寄出後無法收回。發布後仍可修改議程與名單，但不會再寄信。`
              : "發布後參與人就看得到這場會議。之後仍可修改議程與名單。",
            confirmLabel: "發布",
          }}
        />
        {blocked ? <p className="mt-2 text-sm font-bold text-muted-foreground">請先到下方「② 參與人」加入名單。</p> : null}
      </div>
    </>
  );
}

function ScheduledStage({
  counts,
  startsAtLabel,
  notify,
  checkinUrl,
}: {
  counts: WorkbenchCounts;
  startsAtLabel: string;
  notify: NotifyStats;
  checkinUrl: string;
}) {
  return (
    <>
      <h2 className="mt-1 text-xl font-extrabold">已發布，等開會</h2>
      <Facts
        items={[
          `參與人 ${counts.participants} 人`,
          `已通知 ${notify.sent} 人${notify.pending ? `・待寄 ${notify.pending}` : ""}${notify.failed ? `・失敗 ${notify.failed}` : ""}`,
          `議程 ${counts.agenda} 項・表決案 ${counts.motions} 案`,
        ]}
      />
      <p className="mt-4 text-sm font-medium text-muted-foreground">
        會議將於 {startsAtLabel} 開始，開始後簽到與表決會自動開放。現在可以繼續調整下方的名單與議程。
      </p>
      <div className="mt-4">
        <CopyLinkButton url={checkinUrl} label="複製簽到連結" />
      </div>
    </>
  );
}

function LiveStage({ meetingId, counts }: { meetingId: number; counts: WorkbenchCounts }) {
  const voting = counts.openMotions > 0;
  return (
    <>
      <h2 className="mt-1 text-xl font-extrabold">會議進行中</h2>
      <Facts
        items={[
          `已簽到 ${counts.checkedIn}／${counts.participants}`,
          `表決中 ${counts.openMotions} 案`,
          `已結算 ${counts.closedMotions} 案`,
        ]}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <LinkButton href={`/chair?id=${meetingId}`} variant="primary">
          主席控制台
        </LinkButton>
        <LinkButton href={`/display?id=${meetingId}`}>投放畫面</LinkButton>
        <LinkButton href={`/checkin?id=${meetingId}`}>簽到台</LinkButton>
      </div>
      <div className="mt-5 border-t-2 border-dashed border-foreground/30 pt-4">
        <ConfirmActionButton
          variant="destructive"
          size="sm"
          label="結束會議"
          pendingLabel="結束中…"
          disabled={voting}
          action={() => setMeetingStatusAction(meetingId, "closed")}
          confirm={{
            title: "確定要結束這場會議嗎？",
            description: "結束後參與人無法再簽到與表決。若按錯，可在「① 基本資料」重新開啟。",
            confirmLabel: "結束會議",
          }}
        />
        {voting ? <p className="mt-2 text-sm font-bold text-muted-foreground">有表決進行中，請先在主席控制台停止。</p> : null}
      </div>
    </>
  );
}

function ClosedStage({ meetingId, counts }: { meetingId: number; counts: WorkbenchCounts }) {
  return (
    <>
      <h2 className="mt-1 text-xl font-extrabold">會議已結束</h2>
      <Facts
        items={[
          `實到 ${counts.checkedIn}／${counts.participants}`,
          `表決 ${counts.closedMotions} 案已結算`,
          `紀錄 ${counts.notes} 則`,
        ]}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <LinkButton href={`/report?id=${meetingId}`}>列印 PDF</LinkButton>
        <LinkButton href={`/ballots?meetingId=${meetingId}`}>投票紀錄</LinkButton>
      </div>
    </>
  );
}
