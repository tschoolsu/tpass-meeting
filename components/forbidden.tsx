// 站內 403：已登入但角色不夠。取代「把人導去 portal」——誤點不該被彈出站外。
// 形狀照 tpass-form 的 Forbidden.tsx。
import { ShieldX } from "lucide-react";
import { LinkButton } from "@/components/link-button";

export function Forbidden({
  title = "沒有權限",
  message = "這個頁面只開放給會議的建立者或管理員。",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-foreground bg-tone-rose-bg text-tone-rose-text shadow-[4px_4px_0_0_var(--color-foreground)]">
        <ShieldX className="h-8 w-8" />
      </span>
      <h1 className="mt-6 text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 font-medium text-muted-foreground">{message}</p>
      <LinkButton href="/" className="mt-6">
        回會議列表
      </LinkButton>
    </div>
  );
}
