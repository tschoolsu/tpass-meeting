import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/auth/callback —— auth 以 form_post 回傳 token，驗章後寫入 HttpOnly cookie。
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = form.get("token");
  const next = String(form.get("next") ?? "/");

  if (typeof token !== "string" || !token) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const claims = await verifySession(token);
  if (!claims) {
    return new NextResponse("Invalid token", { status: 401 });
  }

  // 防 Open Redirect：只接受站內絕對路徑。
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const selfUrl = process.env.SERVICE_SELF_URL || "http://localhost:3009";
  const response = NextResponse.redirect(new URL(safeNext, selfUrl), 303);

  // Host-only HttpOnly cookie（不設 Domain），XSS 偷不走、也不跨子網域傳送。
  response.cookies.set("tpass_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: selfUrl.startsWith("https://"),
    path: "/",
    maxAge: Math.max(0, claims.exp - Math.floor(Date.now() / 1000)),
  });

  return response;
}
