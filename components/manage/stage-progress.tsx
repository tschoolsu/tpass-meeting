// 工作台頂部的四格進度列。純顯示、不可點：已完成 ✓、現在 ●、未到 ○。
// 導覽責任在下方的手風琴，這裡不放第二套導覽。
import { cn } from "tpass-ui";
import { MANAGE_PHASE_META, PHASE_ORDER, type MeetingPhase } from "@/lib/meeting-status";

export function StageProgress({ phase }: { phase: MeetingPhase }) {
  const currentIndex = PHASE_ORDER.indexOf(phase);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="會議進度">
      {PHASE_ORDER.map((p, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <li
            key={p}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-xl border-2 px-3 py-2 font-mono text-xs font-bold",
              state === "done" && "border-foreground bg-tone-green-badge text-tone-green-text",
              state === "current" && "border-foreground bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]",
              state === "upcoming" && "border-foreground/30 bg-card text-muted-foreground/60",
            )}
          >
            <span aria-hidden>{state === "done" ? "✓" : state === "current" ? "●" : "○"}</span>
            {MANAGE_PHASE_META[p].label.split("・")[0]}
          </li>
        );
      })}
    </ol>
  );
}
