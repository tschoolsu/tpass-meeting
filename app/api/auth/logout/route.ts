import { NextResponse } from "next/server";

export const runtime = "nodejs";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// POST /api/auth/logout —— 同時登出本站與 T-Pass auth：
// 1. 清掉本站的 per-service cookie。
// 2. 以自動送出表單 POST 到 auth 的登出端點，清掉 SSO session，
//    再 303 導回 portal，避免「登出後回來又被自動登入」。
export async function POST() {
  const selfUrl = process.env.SERVICE_SELF_URL || "http://localhost:3009";
  const portalUrl = process.env.PORTAL_URL || "https://portal.tschoolsu.org/";
  const authLogout = `${process.env.AUTH_LOGOUT_URL || "https://auth.tschoolsu.org/api/auth/logout"}?redirect_uri=${encodeURIComponent(portalUrl)}`;

  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>登出中…</title></head>
<body>
<form method="post" action="${escapeHtml(authLogout)}">
<noscript><button type="submit">完成登出</button></noscript>
</form>
<script>document.forms[0].submit()</script>
</body></html>`;

  const response = new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

  response.cookies.set("tpass_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: selfUrl.startsWith("https://"),
    path: "/",
    maxAge: 0,
  });

  return response;
}
