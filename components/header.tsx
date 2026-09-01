// 頂部導覽列。Server Component：登入/登出都是純連結與表單，不需 client 互動。
// 版型與 form / vote / appeals 的 Header 對齊：左「回門戶 + logo」，右「管理入口 badge + 身分 badge + 登出」。
import Link from "next/link";
import { PortalLink } from "@/components/portal-link";

interface HeaderProps {
  isLoggedIn: boolean;
  // 契約 v2 下本服務的身分是自己網域的 cookie，不跟著 portal 換帳號走，
  // 所以「現在是誰」一定要印在畫面上。
  userName?: string | null;
  userEmail?: string | null;
  loginUrl: string;
  logoutUrl: string;
  portalUrl: string;
  isAdmin?: boolean;
}

const NAV_LINK =
  "text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground";

export function Header({ isLoggedIn, userName, userEmail, loginUrl, logoutUrl, portalUrl, isAdmin }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 h-16 border-b-2 border-foreground/20 bg-background/90 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <PortalLink href={portalUrl} />
          <Link href="/" className="font-mono text-lg font-extrabold tracking-tight text-foreground">
            T<span className="text-primary">-</span>Meeting
          </Link>
        </div>

        {isLoggedIn ? (
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/my" className={`${NAV_LINK} shrink-0`}>
              我的會議
            </Link>
            {isAdmin && (
              <Link
                href="/panel"
                className="shrink-0 rounded-md border-2 border-foreground bg-primary px-2.5 py-1 font-mono text-[11px] font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                管理面板
              </Link>
            )}
            <span
              title={userEmail ?? undefined}
              className="max-w-[40vw] truncate rounded-md border-2 border-foreground bg-card px-2 py-0.5 font-mono text-[11px] font-bold text-foreground sm:max-w-none"
            >
              {userName || userEmail || "已登入"}
            </span>
            {/* 登出：POST 到本服務自己的 /api/auth/logout，先清自己的 host-only cookie，
                再由那支 route 鏈到 auth 清登入態（見 config/auth.ts 的 logoutUrl）。 */}
            <form method="post" action={logoutUrl} className="shrink-0">
              <button type="submit" className={NAV_LINK}>
                登出
              </button>
            </form>
          </div>
        ) : (
          <a href={loginUrl} className={NAV_LINK}>
            登入
          </a>
        )}
      </div>
    </header>
  );
}
