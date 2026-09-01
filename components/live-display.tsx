"use client";

import { useLiveState } from "@/components/live-polling";
import { motionLabel } from "@/lib/meeting-status";

export function LiveDisplay({ meetingId }: { meetingId: number }) {
  const { data, error } = useLiveState(meetingId);

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

  return (
    <div className="flex min-h-screen flex-col justify-between gap-10 bg-background p-10 sm:p-14">
      <header className="text-center">
        <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">
          {data.meeting.title}
        </h1>
      </header>

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
                    const ballots = m.ballots ?? [];
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
                        {closed && ballots.length > 0 ? (
                          <div className="mt-6 max-h-64 overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-4">
                            <p className="font-mono text-lg font-extrabold text-muted-foreground">各人意見</p>
                            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              {ballots.map((b) => (
                                <li
                                  key={b.voter_email}
                                  className="flex items-center justify-between rounded-lg border-2 border-foreground bg-tone-green-bg px-3 py-1.5"
                                >
                                  <span className="truncate text-lg font-bold">{b.voter_email}</span>
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

      <footer className="text-center font-mono text-lg font-bold text-muted-foreground">
        應到 {total} · 實到 {checked}
      </footer>
    </div>
  );
}
