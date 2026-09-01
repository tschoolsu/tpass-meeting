// POST /api/auth/callback —— 接收 auth 以 form_post 交付的 per-service token（契約 v2）。
// 驗章四鐵則、Open Redirect 防線、host-only cookie 屬性全在 tpass-auth-js，這裡只有一行。
import { tpass } from "@/config/auth";

export const runtime = "nodejs";

export const POST = tpass.callbackHandler;
