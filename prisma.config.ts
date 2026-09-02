import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// 先 .env.local 再 .env：跟 Next 一樣的優先序。Prisma 7 的 CLI 不再自己讀 env 檔，
// 這一行同時消掉「Prisma CLI 只讀 .env」那個長期坑。
config({ path: [".env.local", ".env"], quiet: true });

// 有連線字串才給 datasource：`prisma generate`（postinstall、CI、fresh clone）不需要連線，
// 缺 env 也要能跑；`migrate` 系列缺了會由 Prisma 自己報「datasource.url property is required」。
// 不給假的 fallback 連線字串——那會讓 migrate 連去不存在的庫而不是 fail fast。
// 這個服務的 env 叫 POSTGRES_URL（config/service.ts 的 REQUIRED），不改名，主機 .env.local 不必動。
const url = process.env.POSTGRES_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
