// 表決案結果的一致顯示：open 顯示「目前是否達標」，closed 顯示「通過／不通過」；
// 同票只標「同票」，不寫通過或不通過（由主席裁示）。無 hook、無 "use client"。
import { Badge } from "tpass-ui";
import { motionOutcome, RESULT_BADGE_CLASS, RESULT_LABEL, type OutcomeSource } from "@/lib/threshold";

export function MotionOutcomeLine({
  motion,
  live,
  size = "sm",
}: {
  motion: OutcomeSource;
  live: { present: number };
  size?: "sm" | "lg";
}) {
  const o = motionOutcome(motion, live);
  if (!o) return null;
  const text = size === "lg" ? "text-xl" : "text-xs";

  if (motion.status === "closed") {
    return (
      <div className={`flex flex-wrap items-center gap-2 font-mono font-bold ${text}`}>
        <Badge className={`${RESULT_BADGE_CLASS[o.result]} ${size === "lg" ? "px-4 py-1 text-xl" : ""}`}>
          {RESULT_LABEL[o.result]}
        </Badge>
        {o.result !== "tie" ? <span className="text-muted-foreground">{o.reason}</span> : null}
      </div>
    );
  }

  const status = o.result === "tie" ? "目前同票" : o.passed ? "已達門檻" : "未達門檻";
  const cls = o.result === "tie" ? "" : o.passed ? "text-tone-green-text" : "text-destructive";
  return (
    <p className={`font-mono font-bold text-muted-foreground ${text}`}>
      同意 {motion.agree}／不同意 {motion.against}／出席 {o.present}，需 {o.agreeNeeded} 票 · <span className={cls}>{status}</span>
    </p>
  );
}
