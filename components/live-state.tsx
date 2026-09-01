"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLiveState, type LiveState } from "@/components/live-polling";

// C-2：讓「同一頁面上多個即時元件」（例如 /read 的 LiveAutoRefresh + VotePopup）
// 共用同一個 useLiveState 實例，而不是各自開一條 SSE + 一個輪詢。
export interface LiveStateContextValue {
  data: LiveState | null;
  error: string | null;
}

const LiveStateContext = createContext<LiveStateContextValue>({ data: null, error: null });

export function LiveStateProvider({
  meetingId,
  enabled = true,
  children,
}: {
  meetingId: number;
  enabled?: boolean;
  children: ReactNode;
}) {
  const value = useLiveState(meetingId, enabled);
  return <LiveStateContext.Provider value={value}>{children}</LiveStateContext.Provider>;
}

export function useLiveStateContext(): LiveStateContextValue {
  return useContext(LiveStateContext);
}
