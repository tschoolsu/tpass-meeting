<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# tpass-meeting（T-Meeting 會議輔助）

會議記錄／簽到／表決 + 對外 API key。資料庫 **Prisma 7 + PostgreSQL + migrations**（`@prisma/adapter-pg`，連線字串 env `POSTGRES_URL`）；schema 在 `prisma/schema.prisma`，generated client 在 repo 根目錄 `generated/prisma`（gitignored，`postinstall` 會產）。生態系總覽、`services.json` 註冊表與
`tpass` CLI 見上層 **tpass-ops** repo（`AGENTS.md`、`docs/`）。

> ⚠️ 這個 repo **沒有 `src/`**：`app/`、`lib/`、`components/`、`config/` 直接在根目錄，tsconfig 的 `@/*` 指向 `./*`。路徑寫 `config/auth.ts`、`lib/auth.ts`，不要寫 `src/…`。

## 鐵律

- 本機跑 `pnpm dev`（已設好 HTTPS + `meeting.lvh.me:3009` + `NODE_TLS_REJECT_UNAUTHORIZED=0`；憑證在 `$HOME/tpass-certs`）。檢查用 `pnpm lint` + `pnpm exec tsc --noEmit`。
- UI 一律 light-only Neobrutalism + OKLCH，元件 import 自 `tpass-ui`（不要在服務裡手刻 primitives）。
- SSO 驗章在**套件 `tpass-auth-js`**——本 repo 只在 `config/auth.ts` 綁 env，callback / logout 兩條 route 各一行（`app/api/auth/{callback,logout}/route.ts`）。要改驗章邏輯就去 `github.com/tschoolsu/tpass-auth-js` 改，**不要在這裡復活一份手抄的 `lib/auth.ts` 驗章**。
- 網域 / issuer / audience / DB 連線全 env 驅動（`config/auth.ts`、`config/service.ts`），不寫死。
- 權限一律讀 JWT 的 `permissions` claim（`tpass.permOf`），不自維護 admin 名單——名單在 auth 的 `/admin` panel 管。
- 每個 server action / route handler 內部都要重呼 `require*` guard（`lib/auth.ts` 的 `requireAccess` / `requireManager` / `requireAdmin`），不能只靠 layout 擋。
- 資料存取一律走 `lib/db.ts` 的 `prisma`；schema 變更一律改 `prisma/schema.prisma` → `pnpm exec prisma migrate dev --name <說明>`，migration 檔一起 commit。**禁止在啟動時跑任何 DDL／資料遷移**（2026-09-02 事故：以前 `lib/db.ts` 每次啟動整包 `CREATE TABLE IF NOT EXISTS` 對所有表拿排他鎖撞出 deadlock）。Prisma 表達不了的 `CHECK` 約束手動寫進該次 migration 的 SQL。`0_init` 是既有庫的 baseline，主機用 `prisma migrate resolve --applied 0_init` 標記，不重跑。
- 表名／欄位名保留 snake_case，不加 `@map`／`@@map`；對外 interface（`lib/meetings.ts` 的 `Meeting`／`Motion`…）時間是 ISO 字串、`meeting_date` 是 `YYYY-MM-DD`，由 `to*()` 轉換函式負責，呼叫端不碰 Prisma row。
- 多步驟寫入包 `prisma.$transaction(async tx => …, { timeout })`；`LISTEN` 只准用 `lib/db.ts` 的 `listenClient()` 那一條獨立 pg client（`lib/stream.ts`），`NOTIFY` 走 `prisma.$executeRaw`。
- 有 SSE：`instrumentation.ts` 在 SIGINT/SIGTERM 時主動關 SSE → LISTEN → 連線池（`lib/shutdown.ts`），新的長連線一律用 `registerStreamClose()` 登記，否則 pm2 reload 會等到 SIGKILL。
- `DEPARTMENTS` env 的一次性種子搬到 `pnpm db:seed`（`prisma/seed.ts`，表非空不灌），不再在啟動時跑。
