import type { ReactNode } from "react";
import { authConfig } from "@/config/auth";
import { getPermissionEntry, getSession, isAdmin } from "@/lib/auth";
import { AccessGate } from "@/components/access-gate";
import { Header } from "@/components/header";

// 全站外殼：Header + 內容容器 + Footer。版型與 vote 的 PublicShell 對齊。
export async function AppShell({ children }: { children: ReactNode }) {
  const session = await getSession();
  const perm = getPermissionEntry(session);

  return (
    <>
      <AccessGate restriction={perm.restriction} reason={perm.reason} />
      <Header
        isLoggedIn={session !== null}
        userName={session?.name}
        userEmail={session?.email}
        loginUrl={authConfig.loginUrl}
        logoutUrl={authConfig.logoutUrl}
        portalUrl={authConfig.portalUrl}
        isAdmin={isAdmin(session)}
      />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
      </main>
      <footer className="border-t-2 border-dashed border-foreground/30 py-8 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="font-mono text-sm font-extrabold text-foreground">
            T<span className="text-primary">-</span>Meeting
          </span>
          <span className="font-mono text-xs font-bold text-muted-foreground">會議記錄 · 簽到 · 表決</span>
        </div>
      </footer>
    </>
  );
}
