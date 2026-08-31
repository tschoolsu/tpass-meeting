"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiveState } from "@/components/live-polling";

// 主席開放表決時，與會者端跳出一個彈窗，可一鍵進入表決。其餘 UI 不動。
export function VotePopup({ meetingId, enabled }: { meetingId: number; enabled: boolean }) {
  const { data } = useLiveState(meetingId, enabled);
  const [popup, setPopup] = useState<{ id: number; title: string } | null>(null);
  const seenOpen = useRef<Set<number>>(new Set());
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!data || !enabled) return;

    const openIds = data.agenda
      .flatMap((a) => a.motions)
      .filter((m) => m.status === "open")
      .map((m) => m.id);

    // 首次載入：把目前已開放的都記為「看過」，避免對既存開放案彈窗
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      openIds.forEach((id) => seenOpen.current.add(id));
      return;
    }

    // 之後只要「新開放」的表決案就彈窗
    const fresh = openIds.find((id) => !seenOpen.current.has(id));
    if (fresh) {
      seenOpen.current.add(fresh);
      const motion = data.agenda.flatMap((a) => a.motions).find((m) => m.id === fresh);
      setPopup({ id: fresh, title: motion?.title ?? "表決" });
    }
  }, [data, enabled]);

  if (!popup) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_0_var(--color-foreground)]">
        <h3 className="text-lg font-extrabold">主席已開放表決</h3>
        <p className="mt-2 text-sm font-medium text-muted-foreground">{popup.title}</p>
        <div className="mt-5 flex items-center gap-3">
          <Link
            href={`/vote?id=${popup.id}`}
            className="flex-1 rounded-xl border-2 border-foreground bg-accent px-4 py-2.5 text-center text-sm font-bold text-accent-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            進入表決
          </Link>
          <button
            type="button"
            onClick={() => setPopup(null)}
            className="rounded-xl border-2 border-foreground bg-card px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            稍後
          </button>
        </div>
      </div>
    </div>
  );
}
