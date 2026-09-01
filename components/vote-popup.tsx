"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <Card className="w-full max-w-sm shadow-[6px_6px_0_0_var(--color-foreground)]">
        <h3 className="text-lg font-extrabold">主席已開放表決</h3>
        <p className="mt-2 text-sm font-medium text-muted-foreground">{popup.title}</p>
        <div className="mt-5 flex items-center gap-3">
          <LinkButton href={`/vote?id=${popup.id}`} variant="accent" className="flex-1">
            進入表決
          </LinkButton>
          <Button type="button" onClick={() => setPopup(null)}>
            稍後
          </Button>
        </div>
      </Card>
    </div>
  );
}
