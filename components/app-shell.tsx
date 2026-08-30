import Link from "next/link";
import type { ReactNode } from "react";
import { getPermissionEntry, getSession, isAdmin } from "@/lib/auth";
import { AccessGate } from "@/components/access-gate";

const roleLabel: Record<string, string> = {
  admin: "ADMIN",
  moderator: "MOD",
  default: "GUEST",
};

export async function AppShell({ children }: { children: ReactNode }) {
  const session = await getSession();
  const perm = getPermissionEntry(session);
  const userName = session?.name || "訪客";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AccessGate restriction={perm.restriction} reason={perm.reason} />
      <header className="sticky top-0 z-50 border-b-2 border-foreground bg-background/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="font-mono text-lg font-extrabold tracking-tight text-foreground transition-opacity hover:opacity-70"
          >
            T<span className="text-primary">-</span>Pass Meeting
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/my"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3.5 py-2 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              我的會議
            </Link>
            {isAdmin(session) ? (
              <Link
                href="/panel"
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-accent/10 px-3.5 py-2 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)]"
              >
                管理面板
              </Link>
            ) : null}

            <div className="flex items-center gap-2.5 rounded-xl border-2 border-foreground bg-card px-3.5 py-1.5 shadow-[3px_3px_0_0_var(--color-foreground)]">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-foreground bg-tone-badge font-mono text-xs font-extrabold">
                {userName.trim().charAt(0) || "?"}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold">{userName}</div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {roleLabel[perm.role] ?? "GUEST"}
                </div>
              </div>
            </div>

            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-destructive px-3.5 py-2 text-sm font-bold text-background shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)]"
              >
                登出
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t-2 border-dashed border-foreground/30 py-4 text-center font-mono text-xs font-bold text-muted-foreground print:hidden">
        T-Pass Meeting · 會議輔助系統
      </footer>
    </div>
  );
}
