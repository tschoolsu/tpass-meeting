"use client";

// 掛在每個「跟某場會議有關」的頁面上，一條 useLiveState 做兩件事：
// 1. refresh：快照簽章變了就 router.refresh()，Server Component 頁面不用手動 F5。
// 2. popup：有 open 且我（已簽到）還沒投的表決案就彈窗——條件全由快照推導，
//    換頁、重整都不會吞掉；投完或主席停止，快照更新後自動消失。
//    「稍後」只記在 sessionStorage（關分頁就重置）。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "tpass-ui";
import { LinkButton } from "@/components/link-button";
import { useLiveState } from "@/components/live-polling";
import { liveSignature, pendingMotionsFor } from "@/lib/live-state";

const REFRESH_THROTTLE_MS = 1000;

function dismissKey(meetingId: number, motionId: number) {
  return `tpm:popup-dismissed:${meetingId}:${motionId}`;
}

function isDismissed(meetingId: number, motionId: number): boolean {
  try {
    return sessionStorage.getItem(dismissKey(meetingId, motionId)) === "1";
  } catch {
    return false;
  }
}

export function MeetingLive({
  meetingId,
  refresh = true,
  popup = true,
  excludeMotionId,
}: {
  meetingId: number;
  /** 快照變了就 router.refresh()（純 client 渲染的頁面關掉它）。 */
  refresh?: boolean;
  /** 顯示「主席已開放表決」彈窗。 */
  popup?: boolean;
  /** 已經在這一案的 /vote 頁時，不對它自己彈窗。 */
  excludeMotionId?: number;
}) {
  const router = useRouter();
  const { data } = useLiveState(meetingId);
  const lastSig = useRef("");
  const lastRefreshAt = useRef(0);
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dismissedTick, setDismissedTick] = useState(0);
  // 「會議已結束」彈窗只在「這個分頁看著它從進行中變成結束」時跳；開一個早就結束的會議不跳。
  const [firstPhase, setFirstPhase] = useState<string | null>(null);
  const [closedDismissed, setClosedDismissed] = useState(false);
  if (data && firstPhase === null) setFirstPhase(data.meeting.phase); // 首次快照時記一次（render 期間調整 state 的合法用法）

  // refresh：trailing throttle，開票時一票一刷也最多每秒一次。
  useEffect(() => {
    if (!refresh || !data) return;
    const sig = liveSignature(data);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (lastRefreshAt.current === 0) {
      lastRefreshAt.current = Date.now(); // 首次快照＝頁面剛渲染的狀態，不用刷
      return;
    }
    const wait = Math.max(0, REFRESH_THROTTLE_MS - (Date.now() - lastRefreshAt.current));
    if (pendingRefresh.current) clearTimeout(pendingRefresh.current);
    pendingRefresh.current = setTimeout(() => {
      lastRefreshAt.current = Date.now();
      pendingRefresh.current = null;
      router.refresh();
    }, wait);
  }, [data, refresh, router]);

  useEffect(
    () => () => {
      if (pendingRefresh.current) clearTimeout(pendingRefresh.current);
    },
    [],
  );

  if (!popup || !data) return null;

  if (data.meeting.phase === "closed" && firstPhase !== null && firstPhase !== "closed" && !closedDismissed) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 p-4">
        <Card className="w-full max-w-sm shadow-[6px_6px_0_0_var(--color-foreground)]">
          <h3 className="text-lg font-extrabold">會議已結束</h3>
          <p className="mt-2 text-sm font-medium text-muted-foreground">{data.meeting.title}</p>
          <div className="mt-5 flex items-center gap-3">
            <LinkButton href="/" variant="accent" className="flex-1">
              回首頁
            </LinkButton>
            <Button type="button" onClick={() => setClosedDismissed(true)}>
              留在此頁
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  void dismissedTick; // 只為了在「稍後」後重新計算
  const target = pendingMotionsFor(data).find(
    ({ motion }) => motion.id !== excludeMotionId && !isDismissed(meetingId, motion.id),
  );
  if (!target) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 p-4">
      <Card className="w-full max-w-sm shadow-[6px_6px_0_0_var(--color-foreground)]">
        <h3 className="text-lg font-extrabold">主席已開放表決</h3>
        <p className="mt-2 text-sm font-bold">{target.agenda.title}</p>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{target.motion.title}</p>
        <div className="mt-5 flex items-center gap-3">
          <LinkButton href={`/vote?id=${target.motion.id}`} variant="accent" className="flex-1">
            進入表決
          </LinkButton>
          <Button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem(dismissKey(meetingId, target.motion.id), "1");
              } catch {
                /* 無法存就只關這次 */
              }
              setDismissedTick((n) => n + 1);
            }}
          >
            稍後
          </Button>
        </div>
      </Card>
    </div>
  );
}
