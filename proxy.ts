import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 全站安全標頭。JWT 驗證在後端（lib/auth），proxy 不做授權判斷。
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // 登出頁需要以自動送出表單 POST 到 auth 登出端點（跨站），
  // 套用 form-action 限制會擋掉送出，故登出頁不放 CSP（與 portal 一致）。
  if (request.nextUrl.pathname !== "/api/auth/logout") {
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
      ].join("; "),
    );
  }

  return response;
}
