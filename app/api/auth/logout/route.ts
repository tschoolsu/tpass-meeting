import { NextResponse } from "next/server";

export const runtime = "nodejs";

// POST /api/auth/logout —— 清除本服務 cookie 後直接導回 portal。
export async function POST() {
  const selfUrl = process.env.SERVICE_SELF_URL || "http://localhost:3009";
  const portalUrl = process.env.PORTAL_URL || "https://portal.tschoolsu.org/";
  const response = NextResponse.redirect(portalUrl, 303);
  response.cookies.set("tpass_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: selfUrl.startsWith("https://"),
    path: "/",
    maxAge: 0,
  });
  return response;
}
