"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveStateContext } from "@/components/live-state";

// 掛在「Server Component 頁面」（如 /read、/chair）內，
// 讓頁面在表決狀態改變時自動 router.refresh() 重新渲染（不靠手動 F5）。
// 資料來源沿用 LiveStateProvider 的共用 useLiveState（C-2）。
//
// C-3：只對「結構性」變更觸發整頁 refresh —— 表決案的開／關狀態與現行議程。
// 票數、實到／應到這類數字變化不走整頁 refresh（由 SSE 在前端元件即時更新），
// 避免表決進行中「每次有人投票就重渲染全場」的風暴。
export function LiveAutoRefresh() {
  const router = useRouter();
  const { data } = useLiveStateContext();
  const lastSig = useRef<string | null>(null);
  const lastRefreshAt = useRef(0);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!data) return;
    // 背景分頁不觸發 refresh，減少背景頁造成的無謂流量
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    // 簽章只含結構：表決案開／關狀態 + 現行議程。
    const sig = JSON.stringify({
      current: data.current?.id ?? null,
      agenda: data.agenda.map((a) => ({
        id: a.id,
        motions: a.motions.map((m) => `${m.id}:${m.status}`),
      })),
    });

    if (sig === lastSig.current) return;
    lastSig.current = sig;

    // 首次載入：Server Component 已經有資料，不重複 refresh。
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      return;
    }

    const now = Date.now();
    if (now - lastRefreshAt.current >= 3000) {
      lastRefreshAt.current = now;
      router.refresh();
    }
  }, [data, router]);

  return null; // 純副作用：不渲染任何東西
}
