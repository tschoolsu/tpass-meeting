"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  nextAgendaItemAction,
  prevAgendaItemAction,
  setCurrentAgendaItemAction,
  setMeetingStatusAction,
  startVoteAction,
  stopVoteAction,
} from "@/lib/actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { Badge, Button, Card } from "tpass-ui";
import { motionLabel } from "@/lib/meeting-status";
import { MotionOutcomeLine } from "@/components/motion-outcome";
import type { OutcomeSource } from "@/lib/threshold";

export function ChairControls({
  meetingId,
  agenda,
  currentId,
  present,
  expected,
}: {
  meetingId: number;
  agenda: {
    id: number;
    title: string;
    motions: ({ id: number; title: string } & OutcomeSource)[];
  }[];
  currentId: number | null;
  /** 即時出席數，給進行中的案算「目前是否達門檻」。 */
  present: number;
  expected: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<{ type: string; id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // null ＝ 簽到階段（會議一開始的預設），按「下一案」才進議程 1。
  const current = agenda.find((a) => a.id === currentId) ?? null;

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

  async function setCurrent(agendaId: number | null) {
    setPending({ type: "current", id: agendaId ?? 0 });
    setError(null);
    const res = await setCurrentAgendaItemAction(meetingId, agendaId);
    setPending(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function step(dir: "prev" | "next") {
    setPending({ type: dir, id: 0 });
    setError(null);
    const res = dir === "next" ? await nextAgendaItemAction(meetingId) : await prevAgendaItemAction(meetingId);
    setPending(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">主席控制台</h2>
        <div className="flex items-center gap-2">
          <Badge className="bg-tone-green-badge">{current ? `現行：${current.title}` : "現行：簽到"}</Badge>
          <Button size="sm" disabled={pending !== null} onClick={() => step("prev")}>
            上一案
          </Button>
          {current !== null && agenda.length > 0 && current.id === agenda[agenda.length - 1].id ? (
            <ConfirmActionButton
              variant="destructive"
              size="sm"
              label="結束會議"
              pendingLabel="結束中…"
              action={() => setMeetingStatusAction(meetingId, "closed")}
              confirm={{
                title: "確定要結束這場會議嗎？",
                description: "投屏會顯示「會議已結束」，參與人會收到提示；簽到與表決一併鎖定。之後可在工作台 ① 重新開啟。",
                confirmLabel: "結束會議",
              }}
            />
          ) : (
            <Button variant="accent" size="sm" disabled={pending !== null} onClick={() => step("next")}>
              下一案
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className={`rounded-xl border-2 border-foreground bg-card p-3 ${current === null ? "ring-4 ring-accent/40" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold">
              簽到
              {current === null ? <Badge className="ml-2 bg-tone-green-badge">現行</Badge> : null}
              <span className="ml-2 font-mono text-xs font-bold text-muted-foreground">
                實到 {present}／應到 {expected}
              </span>
            </p>
            <Button size="sm" disabled={current === null || pending?.type === "current"} onClick={() => setCurrent(null)}>
              設為現行
            </Button>
          </div>
        </div>
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
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border-2 border-foreground bg-tone-green-bg px-3 py-1.5"
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
                        {m.status !== "" ? (
                          <span className="basis-full">
                            <MotionOutcomeLine motion={m} live={{ present }} />
                          </span>
                        ) : null}
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
