<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# tpass-meeting（T-Meeting 會議輔助）

會議記錄／簽到／表決 + 對外 API key。沒有 Prisma：直接用 `pg` + `POSTGRES_URL`，schema 由 `lib/db.ts` 自己 `CREATE TABLE IF NOT EXISTS`。生態系總覽、`services.json` 註冊表與
`tpass` CLI 見上層 **tpass-ops** repo（`AGENTS.md`、`docs/`）。

> ⚠️ 這個 repo **沒有 `src/`**：`app/`、`lib/`、`components/`、`config/` 直接在根目錄，tsconfig 的 `@/*` 指向 `./*`。路徑寫 `config/auth.ts`、`lib/auth.ts`，不要寫 `src/…`。

## 鐵律

- 本機跑 `pnpm dev`（已設好 HTTPS + `meeting.lvh.me:3009` + `NODE_TLS_REJECT_UNAUTHORIZED=0`；憑證在 `$HOME/tpass-certs`）。檢查用 `pnpm lint` + `pnpm exec tsc --noEmit`。
- UI 一律 light-only Neobrutalism + OKLCH，元件 import 自 `tpass-ui`（不要在服務裡手刻 primitives）。
- SSO 驗章在**套件 `tpass-auth-js`**——本 repo 只在 `config/auth.ts` 綁 env，callback / logout 兩條 route 各一行（`app/api/auth/{callback,logout}/route.ts`）。要改驗章邏輯就去 `github.com/tschoolsu/tpass-auth-js` 改，**不要在這裡復活一份手抄的 `lib/auth.ts` 驗章**。
- 網域 / issuer / audience / DB 連線全 env 驅動（`config/auth.ts`、`config/service.ts`），不寫死。
- 權限一律讀 JWT 的 `permissions` claim（`tpass.permOf`），不自維護 admin 名單——名單在 auth 的 `/admin` panel 管。
- 每個 server action / route handler 內部都要重呼 `require*` guard（`lib/auth.ts` 的 `requireAccess` / `requireManager` / `requireAdmin`），不能只靠 layout 擋。
- 沒有 Prisma、沒有 migration：schema 變更直接改 `lib/db.ts` 的冪等 DDL（`CREATE TABLE IF NOT EXISTS`）。
