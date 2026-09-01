"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "tpass-ui";

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
      <Card className="w-full max-w-md shadow-[6px_6px_0_0_var(--color-foreground)]">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-foreground bg-destructive text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]">
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
        <Button type="button" onClick={() => setDismissed(true)} disabled={!canClose} className="mt-4 w-full">
          {canClose ? "關閉" : "請等待 5 秒…"}
        </Button>
      </Card>
    </div>
  );
}
