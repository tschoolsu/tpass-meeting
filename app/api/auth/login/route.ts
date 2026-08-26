import { NextResponse } from "next/server";
import { loginUrlFor } from "@/lib/auth";

// GET /api/auth/login?next=/xxx —— 未登入時的統一入口，導向 auth 授權端點。
export function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/";
  // 防 Open Redirect：只允許站內絕對路徑。
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(loginUrlFor(safeNext), 303);
}
