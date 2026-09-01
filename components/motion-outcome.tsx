// 表決案結果的一致顯示：open 顯示「目前是否達標」，closed 顯示「通過／不通過／無效」。
// 無 hook、無 "use client"，server / client component 都能用。
import { Badge } from "tpass-ui";
import { motionOutcome, RESULT_BADGE_CLASS, RESULT_LABEL, type OutcomeSource } from "@/lib/threshold";

export function MotionOutcomeLine({
  motion,
  live,
  size = "sm",
}: {
  motion: OutcomeSource;
  live: { present: number; expected: number };
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
        <span className="text-muted-foreground">{o.reason}</span>
      </div>
    );
  }

  const quorumText = o.presentNeeded != null ? `出席 ${o.present}／應到 ${o.expected}（需 ${o.presentNeeded}）· ` : "";
  return (
    <p className={`font-mono font-bold text-muted-foreground ${text}`}>
      {quorumText}
      同意 {motion.agree}／出席 {o.present}，需 {o.agreeNeeded} 票 ·{" "}
      <span className={o.passed ? "text-tone-green-text" : "text-destructive"}>{o.passed ? "已達門檻" : "未達門檻"}</span>
    </p>
  );
}
