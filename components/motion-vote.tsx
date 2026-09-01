"use client";

import { useState } from "react";
import { voteAction } from "@/lib/actions";
import { useLiveState, type LiveMotion } from "@/components/live-polling";
import { Badge, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";

const THRESHOLD_LABEL: Record<string, string> = {
  "1/2+1/2": "出席 1/2＋簡單多數",
  "2/3+1/2": "出席 2/3＋簡單多數",
  "2/3+2/3": "出席 2/3＋同意 2/3",
  "3/4": "同意 3/4",
};

export function MotionVote({
  meetingId,
  motionId,
  initialStatus,
  initialAnswered,
}: {
  meetingId: number;
  motionId: number;
  initialStatus: string;
  initialAnswered: "agree" | "against" | null;
}) {
  const { data } = useLiveState(meetingId);
  const [answered, setAnswered] = useState<"agree" | "against" | null>(initialAnswered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 即時狀態：投票開啟時自動解鎖（需求 3）
  const motion: LiveMotion | null = data?.agenda
    .flatMap((a) => a.motions)
    .find((m) => m.id === motionId) ?? null;
  const isOpen = motion ? motion.status === "open" : initialStatus === "open";
  const answeredValue = answered;

  async function cast(status: "agree" | "against") {
    if (!isOpen || busy || answeredValue) return;
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

  return (
    <Card className="mx-auto max-w-2xl text-center">
      <Badge className="bg-tone-green-badge">表決案</Badge>
      <Badge className="ml-2 bg-accent/10">
        {THRESHOLD_LABEL[motion?.threshold ?? "1/2+1/2"] ?? "自訂門檻"}
      </Badge>
      <h1 className="mt-4 text-2xl font-extrabold leading-snug">{motion?.title ?? "表決"}</h1>

      {!isOpen ? (
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
        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => cast("agree")}
            disabled={busy}
            className="rounded-2xl border-2 border-foreground bg-primary px-4 py-6 text-lg font-extrabold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-foreground)] active:translate-y-0 disabled:opacity-40"
          >
            同意
          </button>
          <button
            type="button"
            onClick={() => cast("against")}
            disabled={busy}
            className="rounded-2xl border-2 border-foreground bg-destructive px-4 py-6 text-lg font-extrabold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-foreground)] active:translate-y-0 disabled:opacity-40"
          >
            不同意
          </button>
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
