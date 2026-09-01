"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveState, type LiveAgendaItem, type LiveBallot, type LiveParticipant } from "@/components/live-polling";
import { motionLabel } from "@/lib/meeting-status";
import { displayName } from "@/lib/names";
import { MotionOutcomeLine } from "@/components/motion-outcome";
import { DisplayChairBar } from "@/components/display-chair-bar";

// C-4：快照只帶計數；已結算案的「各人意見」在這裡按需載入一次
// （/api/live/meeting/:id/ballots?motionId=），不讓每次快照都整包序列化 ballots。
function useSettledBallots(meetingId: number, current: LiveAgendaItem | null): Record<number, LiveBallot[]> {
  const [ballots, setBallots] = useState<Record<number, LiveBallot[]>>({});
  const store = useRef<Record<number, LiveBallot[]>>({});
  const inFlight = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!current) return;
    const toFetch = current.motions.filter(
      (m) => m.status === "closed" && !(m.id in store.current) && !inFlight.current.has(m.id),
    );
    for (const m of toFetch) {
      inFlight.current.add(m.id);
      fetch(`/api/live/meeting/${meetingId}/ballots?motionId=${m.id}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ ballots: LiveBallot[] }>) : null))
        .then((b) => {
          if (!b) return;
          store.current[m.id] = b.ballots;
          setBallots({ ...store.current });
        })
        .catch(() => {
          /* 下次快照變化再試 */
        })
        .finally(() => inFlight.current.delete(m.id));
    }
  }, [current, meetingId]);

  return ballots;
}

// 簽到階段（current = null，會議的預設起點）：上半全員名單、未到排前面、可捲動；下半實到／應到。
// 目的是一眼看出誰還沒到，不是把所有人塞進一屏。
function CheckinStage({ participants, checked, total }: { participants: LiveParticipant[]; checked: number; total: number }) {
  const sorted = [...participants].sort((a, b) => {
    if (a.checked_in !== b.checked_in) return a.checked_in ? 1 : -1;
    return displayName(a).localeCompare(displayName(b), "zh-Hant");
  });
  const missing = total - checked;
  return (
    <section className="flex flex-col gap-8">
      {/* 實到／應到放名單上面：名單一長被捲掉，人數還看得到 */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-2xl border-4 border-foreground bg-card p-6 text-center shadow-[8px_8px_0_0_var(--color-foreground)]">
          <div className="font-mono text-6xl font-extrabold text-tone-green-text">{checked}</div>
          <div className="mt-1 font-mono text-xl font-bold text-muted-foreground">實到</div>
        </div>
        <div className="rounded-2xl border-4 border-foreground bg-card p-6 text-center shadow-[8px_8px_0_0_var(--color-foreground)]">
          <div className="font-mono text-6xl font-extrabold">{total}</div>
          <div className="mt-1 font-mono text-xl font-bold text-muted-foreground">應到</div>
        </div>
      </div>
      <div className="rounded-2xl border-4 border-foreground bg-card p-8 shadow-[12px_12px_0_0_var(--color-foreground)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-4xl font-extrabold">簽到</h2>
          <p className="font-mono text-2xl font-extrabold text-muted-foreground">
            未到 <span className={missing > 0 ? "text-destructive" : "text-tone-green-text"}>{missing}</span> 人
          </p>
        </div>
        <ul className="mt-5 grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((p) => (
            <li
              key={p.email}
              className={`flex items-center justify-between gap-2 rounded-xl border-2 border-foreground px-3 py-2 ${
                p.checked_in ? "bg-tone-green-bg text-muted-foreground" : "bg-card"
              }`}
              title={p.email}
            >
              <span className="min-w-0 truncate text-xl font-bold">
                {displayName(p)}
                {p.grade ? <span className="ml-1.5 font-mono text-sm font-bold text-muted-foreground">{p.grade}</span> : null}
              </span>
              <span
                className={`shrink-0 rounded-full border-2 border-foreground px-2.5 py-0.5 font-mono text-sm font-extrabold ${
                  p.checked_in ? "bg-tone-green-badge text-tone-green-text" : "bg-destructive text-primary-foreground"
                }`}
              >
                {p.checked_in ? "已到" : "未到"}
              </span>
            </li>
          ))}
          {participants.length === 0 ? <li className="text-2xl font-bold text-muted-foreground">尚未建立名單</li> : null}
        </ul>
      </div>
    </section>
  );
}

export function LiveDisplay({ meetingId, canControl = false }: { meetingId: number; canControl?: boolean }) {
  const { data, error } = useLiveState(meetingId);
  const ballots = useSettledBallots(meetingId, data?.current ?? null);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
        <p className="text-2xl font-extrabold text-destructive">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
        <p className="font-mono text-4xl font-extrabold text-muted-foreground">載入中…</p>
      </div>
    );
  }

  const current = data.current;
  const checked = data.checked_in;
  const total = data.total;

  // 主席按「結束會議」（或所有議程走完後結束）：投屏只剩一句話。
  if (data.meeting.phase === "closed") {
    return (
      <div className={`flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-10 text-center ${canControl ? "pb-28" : ""}`}>
        <p className="font-mono text-2xl font-bold text-muted-foreground">{data.meeting.title}</p>
        <h1 className="text-6xl font-extrabold sm:text-7xl">會議已結束</h1>
        <p className="font-mono text-2xl font-bold text-muted-foreground">應到 {total} · 實到 {checked}</p>
        {canControl ? <DisplayChairBar meetingId={meetingId} data={data} /> : null}
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen flex-col justify-between gap-10 bg-background p-10 sm:p-14 ${canControl ? "pb-28" : ""}`}>
      <header className="text-center">
        <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">
          {data.meeting.title}
        </h1>
      </header>

      {current === null ? (
        <CheckinStage participants={data.participants} checked={checked} total={total} />
      ) : (
      <section className="grid grid-cols-1 gap-8 sm:grid-cols-[1fr_auto] sm:items-stretch">
        <div className="rounded-2xl border-4 border-foreground bg-card p-10 shadow-[12px_12px_0_0_var(--color-foreground)]">
          {current ? (
            <>
              <p className="font-mono text-sm font-bold text-muted-foreground">
                目前議程 #{current.position + 1}
              </p>
              <h2 className="mt-2 text-5xl font-extrabold leading-tight sm:text-6xl">{current.title}</h2>
              {current.description ? (
                <p className="mt-6 whitespace-pre-wrap text-2xl font-medium text-muted-foreground">
                  {current.description}
                </p>
              ) : null}

              {current.motions.length > 0 ? (
                <div className="mt-8 space-y-6">
                  {current.motions.map((m) => {
                    const open = m.status === "open";
                    const closed = m.status === "closed";
                    const motionBallots = closed ? (ballots[m.id] ?? []) : [];
                    const zh: Record<string, string> = { agree: "同意", against: "不同意" };
                    return (
                      <div key={m.id} className="rounded-2xl border-4 border-foreground bg-tone-green-bg p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-3xl font-extrabold">{m.title}</h3>
                          <span
                            className={`rounded-full border-2 border-foreground px-5 py-1 font-mono text-xl font-extrabold ${
                              open ? "animate-pulse bg-accent text-primary-foreground" : closed ? "bg-secondary" : "bg-tone-green-badge"
                            }`}
                          >
                            {motionLabel(m.status)}
                          </span>
                        </div>
                        {open || closed ? (
                          <div className="mt-4">
                            <MotionOutcomeLine motion={m} live={{ present: checked }} size="lg" />
                          </div>
                        ) : null}
                        {open || closed ? (
                          <div className="mt-5 grid grid-cols-2 gap-4 text-center">
                            <div className="rounded-2xl border-2 border-foreground bg-primary p-4">
                              <div className="font-mono text-5xl font-extrabold text-primary-foreground">{m.agree}</div>
                              <div className="mt-1 font-mono text-xl font-bold text-primary-foreground/80">同意</div>
                            </div>
                            <div className="rounded-2xl border-2 border-foreground bg-destructive p-4">
                              <div className="font-mono text-5xl font-extrabold text-primary-foreground">{m.against}</div>
                              <div className="mt-1 font-mono text-xl font-bold text-primary-foreground/80">不同意</div>
                            </div>
                          </div>
                        ) : null}
                        {closed && motionBallots.length > 0 ? (
                          <div className="mt-6 max-h-64 overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-4">
                            <p className="font-mono text-lg font-extrabold text-muted-foreground">各人意見</p>
                            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              {motionBallots.map((b) => (
                                <li
                                  key={b.voter_email}
                                  className="flex items-center justify-between rounded-lg border-2 border-foreground bg-tone-green-bg px-3 py-1.5"
                                >
                                  <span className="truncate text-lg font-bold" title={b.voter_email}>
                                    {displayName({ name: b.voter_name, email: b.voter_email })}
                                  </span>
                                  <span className="font-mono text-lg font-extrabold text-tone-green-text">
                                    {zh[b.vote_status] ?? b.vote_status}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-4xl font-extrabold text-muted-foreground">尚未開始議程</p>
          )}
        </div>

        <aside className="flex flex-row gap-6 sm:flex-col">
          <div className="rounded-2xl border-4 border-foreground bg-card p-6 text-center shadow-[8px_8px_0_0_var(--color-foreground)]">
            <div className="font-mono text-6xl font-extrabold text-tone-green-text">{checked}</div>
            <div className="mt-1 font-mono text-xl font-bold text-muted-foreground">實到</div>
          </div>
          <div className="rounded-2xl border-4 border-foreground bg-card p-6 text-center shadow-[8px_8px_0_0_var(--color-foreground)]">
            <div className="font-mono text-6xl font-extrabold">{total}</div>
            <div className="mt-1 font-mono text-xl font-bold text-muted-foreground">應到</div>
          </div>
        </aside>
      </section>
      )}

      <footer className="text-center font-mono text-lg font-bold text-muted-foreground">
        應到 {total} · 實到 {checked}
      </footer>
      {canControl ? <DisplayChairBar meetingId={meetingId} data={data} /> : null}
    </div>
  );
}
