"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveState } from "@/components/live-polling";

// 掛在「Server Component 頁面」（如 /read、/chair）內，
// 讓頁面在表決狀態改變時自動 router.refresh() 重新渲染（不靠手動 F5）。
// 資料來源沿用 useLiveState：SSE 主通道（近乎即時）+ 輪詢兜底（≤3 秒）。
export function LiveAutoRefresh({ meetingId }: { meetingId: number }) {
  const router = useRouter();
  const { data } = useLiveState(meetingId, true);
  const lastSig = useRef<string>("");

  useEffect(() => {
    if (!data) return;

    // 簽章：表決案狀態、開票數、現行議程、實到/應到 —— 任一改變即觸發 refresh
    const sig = JSON.stringify({
      agenda: data.agenda.map((a) => ({
        id: a.id,
        motions: a.motions.map((m) => `${m.id}:${m.status}:${m.agree}:${m.against}`),
      })),
      current: data.current?.id ?? null,
      checked: data.checked_in,
    });

    if (sig !== lastSig.current) {
      lastSig.current = sig;
      router.refresh();
    }
  }, [data, router]);

  return null; // 純副作用：不渲染任何東西
}
