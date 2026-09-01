"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveState } from "@/lib/live-state";

export type { LiveAgendaItem, LiveBallot, LiveMotion, LiveState } from "@/lib/live-state";

// 即時連線：快照（/api/live/meeting/:id）是唯一事實來源。
// SSE（/api/live/meeting/:id/stream）收到 CHANGED 就立刻重抓；不管 SSE 活不活，
// 固定 3 秒輪詢一次兜底。不做任何局部合併——以前那套 mergeMotion 會抹掉欄位、漏更新 current。
const POLL_MS = 3000;
const DEBOUNCE_MS = 150;

export function useLiveState(meetingId: number, enabled = true): {
  data: LiveState | null;
  error: string | null;
} {
  const [data, setData] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    let again = false;
    async function snapshot() {
      if (inflight.current) {
        again = true; // 正在飛：結束後再抓一次，不漏掉這次的變化
        return;
      }
      inflight.current = true;
      try {
        const res = await fetch(`/api/live/meeting/${meetingId}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
          setError(null);
        } else if (res.status === 401) {
          setError("未登入");
        }
      } catch {
        /* 等下一次 */
      } finally {
        inflight.current = false;
        if (again && !cancelled) {
          again = false;
          void snapshot();
        }
      }
    }

    function scheduleSnapshot() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(snapshot, DEBOUNCE_MS);
    }

    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/live/meeting/${meetingId}/stream`);
      es.addEventListener("connected", scheduleSnapshot);
      es.addEventListener("CHANGED", scheduleSnapshot);
      es.onerror = () => {
        /* SSE 異常：輪詢仍在背景跑，最多慢 3 秒 */
      };
    } catch {
      /* EventSource 不可用：純輪詢 */
    }

    const pollTimer = setInterval(snapshot, POLL_MS);
    snapshot();

    return () => {
      cancelled = true;
      es?.close();
      if (debounce) clearTimeout(debounce);
      clearInterval(pollTimer);
    };
  }, [meetingId, enabled]);

  return { data, error };
}
