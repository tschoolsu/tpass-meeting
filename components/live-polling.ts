"use client";

import { useEffect, useRef, useState } from "react";

// 即時連線（需求：表決動態即時更新）：
// 主通道為 Server-Sent Events（/api/live/meeting/:id/stream），收到 VOTE_STARTED /
// VOTE_CLOSED 等事件時即時更新 state；SSE 失效時自動降級為短輪詢。
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

const POLL_MS = 3000;

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
    let sseOk = true;

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

    // 主通道：SSE
    try {
      es = new EventSource(`/api/live/meeting/${meetingId}/stream`);
      esRef.current = es;

      es.addEventListener("connected", () => {
        sseOk = true;
        snapshot();
      });
      es.addEventListener("VOTE_STARTED", (e) => {
        const { motion } = JSON.parse(e.data) as { motion: LiveMotion };
        setData((prev) => (prev ? mergeMotion(prev, { ...motion, status: "open" }) : prev));
      });
      es.addEventListener("VOTE_CLOSED", (e) => {
        const { motionId } = JSON.parse(e.data) as { motionId: number };
        setData((prev) => (prev ? setMotionStatus(prev, motionId, "closed") : prev));
      });
      es.onerror = () => {
        // SSE 異常：輪詢已在背景執行，仍保有即時更新能力
        sseOk = false;
      };
    } catch {
      sseOk = false;
    }

    // 無論 SSE 是否正常，都開輪詢作為「保證可靠」的主同步管道：
    // REST snapshot（/api/live/meeting/:id）是唯一事實來源，已實測穩定。
    // SSE 只是加速；輪詢確保即使 SSE 斷線/收不到，狀態仍自動更新。
    pollTimer = setInterval(snapshot, POLL_MS);
    if (sseOk) snapshot();

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
      if (pollTimer) clearInterval(pollTimer);
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

function setMotionStatus(state: LiveState, motionId: number, status: string): LiveState {
  let found = false;
  const agenda = state.agenda.map((a) => {
    if (!a.motions.some((m) => m.id === motionId)) return a;
    found = true;
    return { ...a, motions: a.motions.map((m) => (m.id === motionId ? { ...m, status } : m)) };
  });
  if (!found) return state;
  return { ...state, agenda };
}
