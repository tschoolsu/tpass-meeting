"use client";

import { useState } from "react";
import { voteAction } from "@/lib/actions";
import { useLiveState, type LiveMotion } from "@/components/live-polling";
import { Badge, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";
import { DEFAULT_THRESHOLD, thLabel } from "@/lib/threshold";
import { MotionOutcomeLine } from "@/components/motion-outcome";

export function MotionVote({
  meetingId,
  motionId,
  initialStatus,
  initialAnswered,
  initialCheckedIn,
}: {
  meetingId: number;
  motionId: number;
  initialStatus: string;
  initialAnswered: "agree" | "against" | null;
  initialCheckedIn: boolean;
}) {
  const { data } = useLiveState(meetingId);
  const [answered, setAnswered] = useState<"agree" | "against" | null>(initialAnswered);
  // 兩階段：先選（可改），按「送出」才真的寫入——手機上兩顆大鈕並排，一階段太容易誤觸。
  const [picked, setPicked] = useState<"agree" | "against" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 即時狀態：投票開啟時自動解鎖（需求 3）
  const motion: LiveMotion | null = data?.agenda
    .flatMap((a) => a.motions)
    .find((m) => m.id === motionId) ?? null;
  const isOpen = motion ? motion.status === "open" : initialStatus === "open";
  const checkedIn = data?.me.checked_in ?? initialCheckedIn;
  // 快照說我投過就算投過（例如在別的裝置投的）；本地 answered 只是送出當下的即時回饋。
  const answeredValue = answered ?? (data?.me.voted_motion_ids.includes(motionId) ? "agree" : null);

  async function submit() {
    if (!isOpen || busy || answeredValue || !picked) return;
    const status = picked;
    setBusy(true);
    setError(null);
    const res = await voteAction(motionId, meetingId, status);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAnswered(status);
  }

  const optionClass = (selected: boolean, tone: string) =>
    `rounded-2xl border-2 border-foreground px-4 py-6 text-lg font-extrabold transition-all duration-200 disabled:opacity-40 ${
      selected
        ? `${tone} text-primary-foreground shadow-[6px_6px_0_0_var(--color-foreground)] -translate-y-1`
        : "bg-background text-foreground shadow-[4px_4px_0_0_var(--color-foreground)] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-foreground)] active:translate-y-0"
    }`;

  return (
    <Card className="mx-auto max-w-2xl text-center">
      <Badge className="bg-tone-green-badge">表決案</Badge>
      <Badge className="ml-2 bg-tone-blue-badge text-tone-blue-text">{thLabel(motion?.threshold ?? DEFAULT_THRESHOLD)}</Badge>
      <h1 className="mt-4 text-2xl font-extrabold leading-snug">{motion?.title ?? "表決"}</h1>
      {motion && data && motion.status !== "" ? (
        <div className="mt-3 flex justify-center">
          <MotionOutcomeLine motion={motion} live={{ present: data.checked_in }} />
        </div>
      ) : null}

      {isOpen && !answeredValue && !checkedIn ? (
        <div className="mt-6 rounded-xl border-2 border-foreground bg-secondary px-4 py-4">
          <p className="text-sm font-bold">請先完成簽到再表決</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">門檻以已簽到人數計算，沒簽到的票不算數。</p>
          <LinkButton href={`/checkin?id=${meetingId}`} variant="primary" className="mt-3">
            前往簽到
          </LinkButton>
        </div>
      ) : !isOpen ? (
        <p className="mt-6 rounded-xl border-2 border-foreground bg-secondary px-4 py-3 text-sm font-bold text-muted-foreground">
          {answeredValue
            ? "你已完成這項表決"
            : "表決尚未開放，主席開啟後此處會自動解鎖。"}
        </p>
      ) : answeredValue ? (
        <p className="mt-6 rounded-xl border-2 border-foreground bg-tone-green-bg px-4 py-3 text-sm font-bold text-tone-green-text">
          你已完成這項表決，無法更改。
        </p>
      ) : (
        <div className="mt-8">
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="表決選項">
            <button
              type="button"
              role="radio"
              aria-checked={picked === "agree"}
              onClick={() => setPicked("agree")}
              disabled={busy}
              className={optionClass(picked === "agree", "bg-primary")}
            >
              同意
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={picked === "against"}
              onClick={() => setPicked("against")}
              disabled={busy}
              className={optionClass(picked === "against", "bg-destructive")}
            >
              不同意
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !picked}
            className="mt-4 w-full rounded-2xl border-2 border-foreground bg-foreground px-4 py-4 text-base font-extrabold text-background shadow-[4px_4px_0_0_var(--color-primary)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-primary)] active:translate-y-0 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_0_var(--color-primary)]"
          >
            {picked ? `送出：${picked === "agree" ? "同意" : "不同意"}` : "請先選擇同意或不同意"}
          </button>
          <p className="mt-2 text-xs font-medium text-muted-foreground">送出後不能更改，送出前可以重選。</p>
        </div>
      )}

      {busy ? <p className="mt-5 text-sm font-bold text-muted-foreground">正在送出你的選擇…</p> : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      <p className="mt-6">
        <LinkButton href={`/read?id=${meetingId}`}>← 返回會議</LinkButton>
      </p>
      <p className="mt-3">
        <LinkButton href={`/ballots?meetingId=${meetingId}`}>
          查看每人投票紀錄
        </LinkButton>
      </p>
    </Card>
  );
}
