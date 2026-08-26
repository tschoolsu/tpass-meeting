"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { checkInAction } from "@/lib/actions";

const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 100 + ((i * 37) % 40);
  const colors = ["var(--color-primary)", "var(--color-accent)", "var(--color-destructive)"];
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist,
    color: colors[i % colors.length],
    size: 7 + ((i * 13) % 6),
  };
});

export function CheckinButton({
  meetingId,
  name,
  initialCheckedIn,
}: {
  meetingId: number;
  name: string;
  initialCheckedIn: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "done">(initialCheckedIn ? "done" : "idle");
  const [burst, setBurst] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const didBurst = useRef(false);

  useEffect(() => {
    if (initialCheckedIn && !didBurst.current) {
      didBurst.current = true;
      setBurst((b) => b + 1);
    }
  }, [initialCheckedIn]);

  async function handleClick() {
    if (status !== "idle") return;
    setStatus("submitting");
    setError(null);
    const res = await checkInAction(meetingId);
    if (res.error) {
      setError(res.error);
      setStatus("idle");
      return;
    }
    setBurst((b) => b + 1);
    setStatus("done");
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">{name}</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {status === "done" ? "你已完成簽到，歡迎參加會議！" : "點選下方按鈕完成簽到"}
        </p>
      </div>

      <div className="relative flex items-center justify-center">
        {status === "done" ? (
          <div key={burst} className="pointer-events-none absolute">
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className="burst-particle absolute left-1/2 top-1/2 h-3 w-3 rounded-full border-2 border-foreground"
                style={{
                  "--dx": `${p.dx}px`,
                  "--dy": `${p.dy}px`,
                  background: p.color,
                  width: p.size,
                  height: p.size,
                  animationDelay: `${(i % 5) * 40}ms`,
                } as CSSProperties}
              />
            ))}
          </div>
        ) : null}

        {status === "done" ? (
          <div className="absolute h-40 w-40 animate-ripple rounded-full border-2 border-foreground bg-primary" />
        ) : null}

        <button
          type="button"
          onClick={handleClick}
          disabled={status !== "idle"}
          aria-label="完成簽到"
          className={[
            "relative flex h-44 w-44 items-center justify-center rounded-full border-4 border-foreground",
            "text-lg font-extrabold shadow-[6px_6px_0_0_var(--color-foreground)] transition-all duration-200",
            status === "done"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-foreground hover:-translate-y-1 hover:shadow-[8px_8px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[4px_4px_0_0_var(--color-foreground)]",
            status === "idle" ? "animate-pop" : "cursor-default",
          ].join(" ")}
        >
          <span className="relative">
            {status === "done" ? (
              <>
                <span className="block text-2xl font-extrabold">已完成</span>
                <span className="mt-0.5 block font-mono text-xs font-bold">CHECKED IN</span>
              </>
            ) : status === "submitting" ? (
              "簽到中…"
            ) : (
              <>
                <span className="block text-2xl font-extrabold">簽到</span>
                <span className="mt-0.5 block font-mono text-xs font-bold">CHECK IN</span>
              </>
            )}
          </span>
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
