"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveState } from "@/lib/live-state";

export type { LiveAgendaItem, LiveBallot, LiveMotion, LiveState } from "@/lib/live-state";

// 即時連線：快照（/api/live/meeting/:id）是唯一事實來源。
// SSE（/api/live/meeting/:id/stream）收到 CHANGED 就立刻重抓；不做任何局部合併——
// 以前那套 mergeMotion 會抹掉欄位、漏更新 current。
//
// 輪詢是兜底，不是主通道（C-2）：SSE 健康時只每 30 秒補抓一次（漏掉一個 CHANGED 最多慢 30 秒），
// SSE 斷線或靜默掛掉（60 秒沒 heartbeat）才降到 3 秒。這樣負載不會線性跟著在線人數走。
const FAST_POLL_MS = 3000; // SSE 不健康時
const SLOW_POLL_MS = 30_000; // SSE 健康時的保險
const DEBOUNCE_MS = 150;
const HEARTBEAT_WATCHDOG_MS = 30_000; // 每 30 秒檢查一次 SSE 還活著沒
const STALE_SSE_MS = 60_000; // server 每 25 秒送 heartbeat，60 秒沒聲音就當掛了

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
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;
    let lastEventAt = 0;
    let sseOk = false;

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

    function setPolling(ms: number) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(snapshot, ms);
    }

    function openSse() {
      try {
        es = new EventSource(`/api/live/meeting/${meetingId}/stream`);
      } catch {
        es = null; // EventSource 不可用：純輪詢
        sseOk = false;
        setPolling(FAST_POLL_MS);
        return;
      }
      es.addEventListener("connected", () => {
        lastEventAt = Date.now();
        sseOk = true;
        setPolling(SLOW_POLL_MS);
        scheduleSnapshot();
      });
      es.addEventListener("heartbeat", () => {
        lastEventAt = Date.now();
      });
      es.addEventListener("CHANGED", () => {
        lastEventAt = Date.now();
        scheduleSnapshot();
      });
      es.onerror = () => {
        // 瀏覽器會自己重連；重連成功前用快輪詢撐著
        if (sseOk) {
          sseOk = false;
          setPolling(FAST_POLL_MS);
        }
      };
    }

    // 收到 connected 前先快輪詢，確保第一畫面永遠有資料。
    snapshot();
    setPolling(FAST_POLL_MS);
    openSse();

    const watchdog = setInterval(() => {
      if (!sseOk) return; // 已經在快輪詢，等 connected 把它切回去
      if (Date.now() - lastEventAt > STALE_SSE_MS) {
        // SSE 靜默掛掉（沒 error、也沒 heartbeat）：關掉重開，期間快輪詢
        sseOk = false;
        setPolling(FAST_POLL_MS);
        es?.close();
        openSse();
      }
    }, HEARTBEAT_WATCHDOG_MS);

    return () => {
      cancelled = true;
      es?.close();
      if (debounce) clearTimeout(debounce);
      if (pollTimer) clearInterval(pollTimer);
      clearInterval(watchdog);
    };
  }, [meetingId, enabled]);

  return { data, error };
}
