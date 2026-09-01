import "server-only";
import { query } from "@/lib/db";

// 部會清單：存 DB，由 /panel 管理。env DEPARTMENTS 只在表為空時當一次性種子（見 lib/db.ts）。
// 會議上的 department 是純文字，刪掉部會不影響既有會議；表單會把舊值保留在下拉裡。

const MAX_NAME = 50;

export async function listDepartments(): Promise<string[]> {
  const { rows } = await query<{ name: string }>(`SELECT name FROM departments ORDER BY position, name`);
  return rows.map((r) => r.name);
}

export async function addDepartment(raw: string): Promise<{ error?: string }> {
  const name = raw.trim();
  if (!name) return { error: "請輸入部會名稱" };
  if (name.length > MAX_NAME) return { error: `部會名稱不可超過 ${MAX_NAME} 字` };
  if (name.includes(",")) return { error: "部會名稱不可含逗號" };
  const { rowCount } = await query(
    `INSERT INTO departments (name, position)
     VALUES ($1, (SELECT COALESCE(MAX(position), 0) + 1 FROM departments))
     ON CONFLICT (name) DO NOTHING`,
    [name],
  );
  return rowCount === 0 ? { error: "這個部會已經存在" } : {};
}

export async function removeDepartment(name: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM departments WHERE name = $1`, [name]);
  return rowCount > 0;
}
