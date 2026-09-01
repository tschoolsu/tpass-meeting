import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 全站安全標頭。JWT 驗證在後端（lib/auth），proxy 不做授權判斷。
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("X-Content-Type-Options", "nosniff");
  requestHeaders.set("X-Frame-Options", "SAMEORIGIN");
  requestHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
  requestHeaders.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // HARD-001：全站強制 HTTPS（正式環境由 https 提供；http 連線時瀏覽器會忽略）。
  requestHeaders.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");

  // 登出頁需要以自動送出表單 POST 到 auth 登出端點（跨站），
  // 套用 form-action 限制會擋掉送出，故登出頁不放 CSP（與 portal 一致）。
  if (request.nextUrl.pathname !== "/api/auth/logout") {
    // HARD-002：以 per-request nonce 取代 script-src 'unsafe-inline'。
    // 頁面皆為 force-dynamic，Next.js 會自動把 nonce 套用至框架/內聯 script。
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const isDev = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join("; ");

    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");

  if (request.nextUrl.pathname !== "/api/auth/logout") {
    response.headers.set(
      "Content-Security-Policy",
      requestHeaders.get("Content-Security-Policy") ?? "",
    );
  }

  return response;
}
