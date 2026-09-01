import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { serviceConfig } from "@/config/service";

// mail→姓名對照表：讀取 gitignore 的本地 CSV（格式：第一列表頭 mail,name，之後 mail,name）。
// 檔案不存在或解析失敗就回空表（等於功能沒啟用，通通顯示 mail 原樣）。
// 用 stat 的 mtime 做輕量快取：使用者編輯檔案後，下一個 request 自然重新載入。

let cached: Map<string, string> | null = null;
let cachedMtimeMs: number | null = null;

function csvPath(): string {
  const p = serviceConfig.nameMapCsv;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export async function loadNameMap(): Promise<Map<string, string>> {
  try {
    const s = await stat(csvPath());
    if (cached && cachedMtimeMs === s.mtimeMs) return cached;
    const raw = await readFile(csvPath(), "utf8");
    const map = new Map<string, string>();
    for (const line of raw.split(/[\r\n]+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [mail, name] = trimmed.split(",").map((v) => v.trim());
      if (!mail || !name || mail.toLowerCase() === "mail") continue;
      map.set(mail.toLowerCase(), name);
    }
    cached = map;
    cachedMtimeMs = s.mtimeMs;
    return map;
  } catch {
    return new Map();
  }
}

// 有對照到的顯示姓名，沒有就原樣顯示 mail。
export async function displayName(email: string): Promise<string> {
  return (await loadNameMap()).get(email.toLowerCase()) ?? email;
}
