// POST /api/auth/logout —— 兩段式登出（契約 v2）：
// 1. 清掉本服務自己的 host-only cookie。
// 2. 回一頁自動送出的 form，POST 到 auth 清登入態，auth 再導回本服務根路徑。
// 兩段都在 tpass-auth-js 裡，這裡只有一行。
import { tpass } from "@/config/auth";

export const runtime = "nodejs";

export const POST = tpass.logoutHandler;
