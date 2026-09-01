"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  nextAgendaItemAction,
  setCurrentAgendaItemAction,
  startVoteAction,
  stopVoteAction,
} from "@/lib/actions";
import { Badge, Button, Card } from "tpass-ui";
import { motionLabel } from "@/lib/meeting-status";

export function ChairControls({
  meetingId,
  agenda,
  currentId,
}: {
  meetingId: number;
  agenda: {
    id: number;
    title: string;
    motions: { id: number; title: string; status: string }[];
  }[];
  currentId: number | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<{ type: string; id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = agenda.find((a) => a.id === currentId) ?? agenda[0] ?? null;

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

  async function setCurrent(agendaId: number) {
    setPending({ type: "current", id: agendaId });
    setError(null);
    const res = await setCurrentAgendaItemAction(meetingId, agendaId);
    setPending(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function next() {
    setPending({ type: "next", id: 0 });
    setError(null);
    const res = await nextAgendaItemAction(meetingId);
    setPending(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">主席控制台</h2>
        <div className="flex items-center gap-2">
          <Badge className="bg-tone-green-badge">{current ? `現行：${current.title}` : "尚未選定現行議程"}</Badge>
          <Button variant="accent" size="sm" disabled={pending?.type === "next"} onClick={next}>
            下一案
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {agenda.map((a, i) => {
          const isCurrent = a.id === current?.id;
          return (
            <div
              key={a.id}
              className={`rounded-xl border-2 border-foreground bg-card p-3 ${
                isCurrent ? "ring-4 ring-accent/40" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold">
                  #{i + 1} {a.title}
                  {isCurrent ? <Badge className="ml-2 bg-tone-green-badge">現行</Badge> : null}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                   
                    size="sm"
                    disabled={isCurrent || pending?.id === a.id}
                    onClick={() => setCurrent(a.id)}
                  >
                    設為現行
                  </Button>
                </div>
              </div>

              {a.motions.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {a.motions.map((m) => {
                    const open = m.status === "open";
                    return (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-lg border-2 border-foreground bg-tone-green-bg px-3 py-1.5"
                      >
                        <span className="text-sm font-bold">{m.title}</span>
                        <span className="flex items-center gap-2">
                          <Badge className={open ? "bg-tone-green-badge" : "bg-secondary"}>
                            {motionLabel(m.status)}
                          </Badge>
                          {open ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={pending?.id === m.id}
                              onClick={() => run("stop", m.id)}
                            >
                              停止並宣佈結果
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
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
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">此議程尚未有任何表決案。</p>
              )}
            </div>
          );
        })}
        {agenda.length === 0 ? <p className="text-sm text-muted-foreground">尚未建立任何議程。</p> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
