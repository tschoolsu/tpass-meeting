"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { voteAction } from "@/lib/actions";
import { BtnLink, Card, Tag } from "@/components/ui";

export function VoteFlow({
  voteId,
  question,
  meetingId,
  meetingTitle,
  alreadyVoted,
  nextVoteId,
}: {
  voteId: number;
  question: string;
  meetingId: number;
  meetingTitle: string;
  alreadyVoted: boolean;
  nextVoteId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyVoted && nextVoteId === null);
  const [answered, setAnswered] = useState(alreadyVoted);

  async function answer(value: boolean) {
    if (busy !== null || answered || done) return;
    setBusy(value);
    setError(null);
    const res = await voteAction(voteId, value);
    if (res.error) {
      setError(res.error);
      setBusy(null);
      return;
    }
    setBusy(null);
    setAnswered(true);
    if (res.nextVoteId) {
      router.push(`/vote?id=${res.nextVoteId}`);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <Card className="relative mx-auto max-w-lg overflow-hidden py-12 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="float-up pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 rounded-full border-2 border-foreground"
            style={
              {
                background: i % 2 ? "var(--color-primary)" : "var(--color-accent)",
                "--dx": `${Math.cos((i / 8) * Math.PI * 2) * 120}px`,
                "--dy": `${Math.sin((i / 8) * Math.PI * 2) * 120}px`,
                animationDelay: `${(i % 4) * 60}ms`,
              } as CSSProperties
            }
          />
        ))}
        <p className="font-mono text-5xl font-extrabold tracking-tighter text-primary">DONE</p>
        <h2 className="mt-4 text-2xl font-extrabold">你已完成所有表決</h2>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          你的每一題表決都已記錄，且無法更改。
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <BtnLink href={`/read?id=${meetingId}`} variant="primary">
            查看表決結果
          </BtnLink>
        </div>
      </Card>
    );
  }

  if (answered) {
    return (
      <Card className="mx-auto max-w-lg py-10 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
        <Tag className="bg-tone-badge">已完成本題</Tag>
        <h2 className="mt-4 text-xl font-extrabold">本題已送出，無法更改</h2>
        <p className="mt-2 text-sm font-medium text-muted-foreground">你已回答「{question}」。</p>
        <div className="mt-6 flex justify-center gap-2">
          <BtnLink href={`/read?id=${meetingId}`}>返回會議</BtnLink>
          {nextVoteId ? (
            <BtnLink href={`/vote?id=${nextVoteId}`} variant="primary">
              下一題 →
            </BtnLink>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg py-10 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
      <p className="font-mono text-xs font-bold text-muted-foreground">{meetingTitle}</p>
      <h1 className="mx-auto mt-4 max-w-md text-xl font-extrabold leading-snug sm:text-2xl">
        您是否同意「{question}」
      </h1>
      <p className="mt-2 text-xs font-medium text-muted-foreground">送出後無法更改，請確認你的意願。</p>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => answer(true)}
          disabled={busy !== null}
          className="rounded-2xl border-2 border-foreground bg-primary px-6 py-8 text-xl font-extrabold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)] disabled:opacity-40"
        >
          是
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={busy !== null}
          className="rounded-2xl border-2 border-foreground bg-destructive px-6 py-8 text-xl font-extrabold text-background shadow-[4px_4px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)] disabled:opacity-40"
        >
          否
        </button>
      </div>

      {busy !== null ? (
        <p className="mt-5 text-sm font-bold text-muted-foreground">正在送出你的選擇…</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <BtnLink href={`/read?id=${meetingId}`}>← 返回會議</BtnLink>
      </div>
    </Card>
  );
}
