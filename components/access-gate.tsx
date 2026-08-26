"use client";

import { useEffect, useRef, useState } from "react";

// 警示（warning）權限的進入彈窗：每次進入都顯示，5 秒後才能關閉。
export function AccessGate({ restriction, reason }: { restriction?: string; reason?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (restriction !== "warning") return;
    timerRef.current = window.setTimeout(() => setCanClose(true), 5000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [restriction]);

  const open = restriction === "warning" && !dismissed;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_0_var(--color-foreground)]">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-foreground bg-destructive text-background shadow-[2px_2px_0_0_var(--color-foreground)]">
            !
          </span>
          <h2 className="text-xl font-extrabold">系統提醒</h2>
        </div>
        <p className="mt-4 text-sm font-medium leading-relaxed">{reason || "你目前處於警告狀態。"}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full border-2 border-foreground bg-muted">
            <div className="h-full w-full origin-left animate-shrink rounded-full bg-destructive" />
          </div>
          <span className="shrink-0 font-mono text-xs font-bold">5s</span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={!canClose}
          className="mt-4 w-full rounded-xl border-2 border-foreground bg-card px-4 py-2.5 font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
        >
          {canClose ? "關閉" : "請等待 5 秒…"}
        </button>
      </div>
    </div>
  );
}
