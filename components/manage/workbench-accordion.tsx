"use client";

// 工作台的分區手風琴。每格：標題 + 一行摘要（收合時仍看得到）+ 內容。
// 四格都可點、不鎖定——會議的四件事沒有嚴格先後。phase 變了就重設預設展開，
// 使用者不必自己去點開下一步（渲染期間比對上一輪的 phase，不用 effect）。
import { useState, type ReactNode } from "react";
import { cn } from "tpass-ui";
import type { MeetingPhase } from "@/lib/meeting-status";

export interface WorkbenchSection {
  key: string;
  title: string;
  summary: string;
  content: ReactNode;
}

export function WorkbenchAccordion({
  sections,
  phase,
  defaultOpen,
}: {
  sections: WorkbenchSection[];
  phase: MeetingPhase;
  defaultOpen: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen));
  const [seenPhase, setSeenPhase] = useState(phase);
  if (seenPhase !== phase) {
    setSeenPhase(phase);
    setOpen(new Set(defaultOpen));
  }

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((s, i) => {
        const isOpen = open.has(s.key);
        return (
          <section key={s.key} className="rounded-2xl border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)]">
            <button
              type="button"
              onClick={() => toggle(s.key)}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition-colors hover:bg-muted",
                isOpen && "rounded-b-none border-b-2 border-dashed border-foreground/30",
              )}
            >
              <span className="min-w-0">
                <span className="block text-base font-extrabold">
                  <span className="mr-2 font-mono text-muted-foreground">{["①", "②", "③", "④"][i] ?? ""}</span>
                  {s.title}
                </span>
                <span className="mt-0.5 block truncate font-mono text-xs font-bold text-muted-foreground">{s.summary}</span>
              </span>
              <span aria-hidden className={cn("shrink-0 font-mono text-sm font-bold transition-transform", isOpen && "rotate-90")}>
                ›
              </span>
            </button>
            {isOpen ? <div className="p-5">{s.content}</div> : null}
          </section>
        );
      })}
    </div>
  );
}
