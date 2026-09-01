"use client";

// 通用「按下去會改資料」按鈕：可選 ConfirmDialog 二次確認、pending 態、錯誤就地顯示、
// 成功後 router.refresh()。給狀態推進／刪除／移除名單這類單一 server action 共用，
// 不要每個面板各寫一份。confirm 文案一定要講可逆性（「無法收回」或「隨時可還原」）。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, type ButtonProps } from "tpass-ui";
import type { FormState } from "@/lib/actions";

interface Props extends Omit<ButtonProps, "onClick" | "type"> {
  label: string;
  pendingLabel?: string;
  action: () => Promise<FormState>;
  /** 有給就先跳 ConfirmDialog；沒給就直接執行。 */
  confirm?: { title: string; description?: string; confirmLabel?: string };
  /** 成功後導去這裡（取代 router.refresh()）；刪除當前頁面的資源時用，避免先 refresh 成 404。 */
  navigateTo?: string;
  onDone?: () => void;
}

export function ConfirmActionButton({ label, pendingLabel = "處理中…", action, confirm, navigateTo, onDone, disabled, ...rest }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await action();
      setOpen(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (navigateTo) router.replace(navigateTo);
      else router.refresh();
      onDone?.();
    });
  }

  return (
    <>
      <Button type="button" disabled={disabled || pending} onClick={() => (confirm ? setOpen(true) : run())} {...rest}>
        {pending ? pendingLabel : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 font-mono text-xs font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          open={open}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          pending={pending}
          onConfirm={run}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
