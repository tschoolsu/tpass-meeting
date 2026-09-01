"use client";

// 投屏頁底部的主席控制列：只有 owner/admin 登入時才會被渲染（app/display/page.tsx 判斷），
// 安全仍靠每個 action 內的 requireManager + canEditMeeting。預設收合，投影畫面乾淨；
// 操作後不用 router.refresh()——action 會 notifyMeetingChanged，LiveDisplay 自己重抓快照。
import { useState } from "react";
import { Badge, Button } from "tpass-ui";
import { nextAgendaItemAction, prevAgendaItemAction, startVoteAction, stopVoteAction } from "@/lib/actions";
import type { LiveState } from "@/lib/live-state";
import { motionLabel } from "@/lib/meeting-status";

const OPEN_KEY = "tpm:display-bar-open";

export function DisplayChairBar({ meetingId, data }: { meetingId: number; data: LiveState }) {
  // 這個元件只在快照到手後才渲染（LiveDisplay 在 data=null 時畫「載入中」），不會 SSR，
  // 所以可以直接在初始值讀 localStorage。
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  async function run(key: string, fn: () => Promise<{ error?: string; hasNext?: boolean; hasPrev?: boolean }>) {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    const res = await fn();
    setBusy(null);
    if (res.error) setNotice(res.error);
    else if (res.hasNext === false) setNotice("已經是最後一案");
    else if (res.hasPrev === false) setNotice("已經在簽到階段");
  }

  const current = data.current;

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <Button type="button" size="sm" onClick={toggle}>
          主席控制 ▲
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-4 border-foreground bg-card shadow-[0_-6px_0_0_var(--color-foreground)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Badge className="bg-tone-green-badge">{current ? `現行：#${current.position + 1} ${current.title}` : "現行：簽到"}</Badge>
        <span className="flex items-center gap-1.5">
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => run("prev", () => prevAgendaItemAction(meetingId))}>
            ◀ 上一案
          </Button>
          <Button type="button" size="sm" variant="accent" disabled={busy !== null} onClick={() => run("next", () => nextAgendaItemAction(meetingId))}>
            下一案 ▶
          </Button>
        </span>

        <span className="flex flex-wrap items-center gap-2">
          {current?.motions.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-tone-green-bg px-2.5 py-1">
              <span className="max-w-48 truncate text-sm font-bold" title={m.title}>
                {m.title}
              </span>
              {m.status === "open" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={() => run(`stop:${m.id}`, () => stopVoteAction(m.id, meetingId))}
                >
                  停止表決
                </Button>
              ) : m.status === "closed" ? (
                <Badge className="bg-secondary">
                  {motionLabel(m.status)} {m.agree}／{m.against}
                </Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => run(`start:${m.id}`, () => startVoteAction(m.id, meetingId))}
                >
                  開放表決
                </Button>
              )}
            </span>
          ))}
          {current && current.motions.length === 0 ? (
            <span className="text-xs font-bold text-muted-foreground">此議程沒有表決案</span>
          ) : null}
          {!current ? (
            <span className="text-xs font-bold text-muted-foreground">
              實到 {data.checked_in}／應到 {data.total}，按「下一案」進議程 1
            </span>
          ) : null}
        </span>

        {notice ? (
          <span role="alert" className="font-mono text-xs font-bold text-destructive">
            {notice}
          </span>
        ) : null}

        <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={toggle}>
          收合 ▼
        </Button>
      </div>
    </div>
  );
}
