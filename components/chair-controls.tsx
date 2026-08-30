"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startVoteAction, stopVoteAction } from "@/lib/actions";
import { Button, Card, Tag } from "@/components/ui";

export function ChairControls({
  meetingId,
  agenda,
}: {
  meetingId: number;
  agenda: {
    id: number;
    title: string;
    motions: { id: number; title: string; status: string }[];
  }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<{ type: string; id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = agenda[0] ?? null;

  async function run(type: "start" | "stop", motionId: number) {
    setPending({ type, id: motionId });
    setError(null);
    const res =
      type === "start"
        ? await startVoteAction(motionId, meetingId)
        : await stopVoteAction(motionId, meetingId);
    setPending(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">主席控制台</h2>
        <Tag className="bg-tone-badge">現行議程</Tag>
      </div>

      {current ? (
        <div>
          <p className="text-sm font-extrabold">當前：{current.title}</p>
          <ul className="mt-3 space-y-2">
            {current.motions.map((m) => {
              const open = m.status === "open";
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-card px-3 py-2"
                >
                  <span className="text-sm font-bold">{m.title}</span>
                  <span className="flex items-center gap-2">
                    <Tag className={open ? "bg-tone-badge" : "bg-secondary"}>
                      {m.status === "open" ? "表決中" : m.status === "closed" ? "已結算" : "未開放"}
                    </Tag>
                    {open ? (
                      <Button
                        variant="destructive"
                        disabled={pending?.id === m.id}
                        onClick={() => run("stop", m.id)}
                      >
                        停止並宣佈結果
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        disabled={pending?.id === m.id || m.status === "closed"}
                        onClick={() => run("start", m.id)}
                      >
                        開始表決
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
            {current.motions.length === 0 ? (
              <p className="text-sm text-muted-foreground">此議程尚未有任何表決案。</p>
            ) : null}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">尚未建立任何議程。</p>
      )}

      {error ? (
        <p role="alert" className="rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
