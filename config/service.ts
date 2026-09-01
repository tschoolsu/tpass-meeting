// T-Meeting 自己的（非 SSO）設定中心。整個 repo 只有 config/*.ts 可以碰 process.env，
// 其他地方一律從這裡 import；沒有任何網域或連線字串的寫死備援。
import "server-only";

// 必填：缺了就啟動即炸，不要帶著本機預設值悄悄連到錯的資料庫。
const REQUIRED = ["POSTGRES_URL"] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `[config/service] 缺少必填環境變數：${missing.join(", ")}（請檢查 .env.local）`,
  );
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

// SMTP 是選配：host 與 from 都有才算「有設定」，否則通知功能整個靜默略過。
function smtpFromEnv(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from,
  };
}

export const serviceConfig = {
  postgresUrl: process.env.POSTGRES_URL!,
  // 部會清單的一次性種子（逗號分隔）：只在 DB 的 departments 表是空的時候匯入，之後在 /panel 管。
  departments: (process.env.DEPARTMENTS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean),
  // 是否允許一般學生（default）自主建立會議。
  allowStudentCreate: process.env.ALLOW_STUDENT_CREATE === "true",
  smtp: smtpFromEnv(),
} as const;
