"use client";

import { useEffect, useRef, useState } from "react";

// 短輪詢（需求 3／5）：定期向 /api/live/meeting/:id 拉最新狀態。
export interface LiveMotion {
  id: number;
  title: string;
  threshold: string;
  status: string;
  agree: number;
  against: number;
  abstain: number;
}

export interface LiveAgendaItem {
  id: number;
  position: number;
  title: string;
  description: string;
  motions: LiveMotion[];
}

export interface LiveState {
  meeting: { id: number; title: string; status: string; starts_at: string };
  checked_in: number;
  total: number;
  current: LiveAgendaItem | null;
  agenda: LiveAgendaItem[];
}

const POLL_MS = 3000;

export function useLiveState(meetingId: number, enabled = true): {
  data: LiveState | null;
  error: string | null;
} {
  const [data, setData] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/live/meeting/${meetingId}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) {
            setData(json as LiveState);
            setError(null);
          }
        } else {
          const j = await res.json().catch(() => null);
          if (!cancelled) setError(j?.error ?? "載入失敗");
        }
      } catch {
        if (!cancelled) setError("連線失敗");
      }
    }
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [meetingId, enabled]);

  return { data, error };
}
