"use client";

import { useEffect, useRef, useState } from "react";

// 即時連線（需求：表決動態即時更新）：
// 主通道為 Server-Sent Events（/api/live/meeting/:id/stream），收到 VOTE_STARTED /
// VOTE_CLOSED / AGENDA_CHANGED / CHECKIN 等事件時即時更新 state。
//
// C-2：SSE 健康時【停止輪詢】——輪詢只當降級用（SSE 斷線／靜默掛掉才開啟），
// 並用 heartbeat watchdog 偵測「SSE 看似連著但已經不送東西」的狀態。
// 這樣每個線上用戶不會再無條件每 3 秒打一次 /api/live/:id，負載不再線性跟著用戶數走。
export interface LiveMotion {
  id: number;
  title: string;
  threshold: string;
  status: string;
  agree: number;
  against: number;
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

const POLL_MS = 3000; // 降級模式的輪詢間隔
const HEARTBEAT_WATCHDOG_MS = 30_000; // 每 30s 檢查一次 SSE 是否還活著
const STALE_SSE_MS = 60_000; // 超過 60s 沒收到任何事件（含 heartbeat）視為掛掉

export function useLiveState(meetingId: number, enabled = true): {
  data: LiveState | null;
  error: string | null;
} {
  const [data, setData] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let lastEventAt = 0;
    let sseOk = false;

    async function snapshot() {
      try {
        const res = await fetch(`/api/live/meeting/${meetingId}`, { cache: "no-store" });
        if (!cancelled && res.ok) {
          setData(await res.json());
          setError(null);
        } else if (!cancelled && res.status === 401) {
          setError("未登入");
        }
      } catch {
        /* 等下一次 */
      }
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function startPolling() {
      if (!pollTimer) pollTimer = setInterval(snapshot, POLL_MS);
    }

    function openSse() {
      let source: EventSource;
      try {
        source = new EventSource(`/api/live/meeting/${meetingId}/stream`);
      } catch {
        sseOk = false;
        startPolling();
        return;
      }
      es = source;
      esRef.current = source;

      source.addEventListener("connected", () => {
        lastEventAt = Date.now();
        sseOk = true;
        stopPolling();
        snapshot();
      });
      source.addEventListener("heartbeat", () => {
        lastEventAt = Date.now();
      });
      source.addEventListener("VOTE_STARTED", (e) => {
        lastEventAt = Date.now();
        const { motion } = JSON.parse(e.data) as { motion: LiveMotion };
        setData((prev) => (prev ? mergeMotion(prev, { ...motion, status: "open" }) : prev));
      });
      source.addEventListener("VOTE_CLOSED", () => {
        lastEventAt = Date.now();
        // 結算後撈一次完整快照，拿到最終票數（結算是低頻事件，每個 viewer 一次 OK）
        snapshot();
      });
      source.addEventListener("AGENDA_CHANGED", () => {
        lastEventAt = Date.now();
        // 現行議程被主席推進：撈一次快照
        snapshot();
      });
      source.addEventListener("CHECKIN", () => {
        lastEventAt = Date.now();
        // 簽到只增不減：本地 +1 就好，不必每個 viewer 都整包 snapshot
        setData((prev) => (prev ? { ...prev, checked_in: prev.checked_in + 1 } : prev));
      });
      source.onerror = () => {
        // SSE 異常：降級輪詢，等下一次重連成功再停掉
        sseOk = false;
        startPolling();
      };
    }

    // 初始：先抓一次快照（第一畫面要有資料），並開啟 SSE。
    // 收到 connected 前先用輪詢撐著，確保永遠有資料。
    snapshot();
    openSse();
    startPolling();

    watchdog = setInterval(() => {
      if (!sseOk) return; // 已降級輪詢，不重複處理
      if (Date.now() - lastEventAt > STALE_SSE_MS) {
        // SSE 靜默掛掉（沒 error 事件、也不送 heartbeat）：關掉重連 + 暫時回到輪詢
        sseOk = false;
        es?.close();
        es = null;
        startPolling();
        openSse();
      }
    }, HEARTBEAT_WATCHDOG_MS);

    return () => {
      cancelled = true;
      es?.close();
      esRef.current = null;
      if (pollTimer) clearInterval(pollTimer);
      if (watchdog) clearInterval(watchdog);
    };
  }, [meetingId, enabled]);

  return { data, error };
}

// 把單一 motion 的事件（或初始 connected 的快照）合併進現有 state（不可變更新）。
function mergeMotion(state: LiveState, motion: LiveMotion): LiveState {
  let found = false;
  const agenda = state.agenda.map((a) => {
    if (!a.motions.some((m) => m.id === motion.id)) return a;
    found = true;
    return { ...a, motions: a.motions.map((m) => (m.id === motion.id ? { ...m, ...motion } : m)) };
  });
  if (!found) return state; // 議程不在現有快照裡，由下一次 snapshot 補齊
  return {
    ...state,
    agenda,
    current: agenda.find((a) => a.motions.some((m) => m.id === motion.id)) ?? state.current,
  };
}
