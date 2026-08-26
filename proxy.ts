import { NextResponse } from "next/server";

// 全站安全標頭。JWT 驗證在後端（lib/auth），proxy 不做授權判斷。
export function proxy() {
  const response = NextResponse.next();

  // 登出時需要把表單 POST 到 auth 的登出端點，故 form-action 需放行 auth 來源。
  let authOrigin = "https://auth.tschoolsu.org";
  try {
    authOrigin = new URL(process.env.JWT_ISSUER || "https://auth.tschoolsu.org").origin;
  } catch {
    /* 保留預設 */
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      `form-action 'self' ${authOrigin}`,
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  );
  return response;
}
