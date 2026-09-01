import Link from "next/link";
import type { MeetingListItem } from "@/lib/meetings";
import { formatTaipei } from "@/lib/time";
import { derivePhase, PUBLIC_PHASE_META } from "@/lib/meeting-status";
import { Badge, Card } from "tpass-ui";

export function MeetingCard({ meeting }: { meeting: MeetingListItem }) {
  const phase = derivePhase(meeting.status, meeting.starts_at);
  return (
    <Link href={`/read?id=${meeting.id}`} className="group block h-full">
      <Card className="flex h-full flex-col items-start gap-3 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-[7px_7px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[3px_3px_0_0_var(--color-foreground)]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PUBLIC_PHASE_META[phase].badgeClass}>{PUBLIC_PHASE_META[phase].label}</Badge>
          {meeting.department ? <Badge className="bg-tone-green-badge">{meeting.department}</Badge> : null}
          <span className="font-mono text-xs font-bold text-muted-foreground">
            {formatTaipei(meeting.starts_at)}
          </span>
        </div>

        <h2 className="text-lg font-extrabold leading-snug">
          {meeting.department ? <span className="text-tone-green-text">[{meeting.department}] </span> : null}
          {meeting.title}
        </h2>

        <div className="mt-auto flex w-full flex-wrap items-center justify-between gap-2 pt-2 text-xs font-medium text-muted-foreground">
          <span>建立者：{meeting.owner_name}</span>
          <span className="font-mono font-bold">
            {meeting.checked_count}/{meeting.participant_count} 已簽到
          </span>
        </div>
      </Card>
    </Link>
  );
}
