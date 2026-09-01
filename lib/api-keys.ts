import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";

export interface ApiKeyRow {
  id: number;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  return `tpm_${randomBytes(24).toString("base64url")}`;
}

// 建立後只回傳一次明碼，資料庫只存雜湊。
export async function createApiKey(label: string): Promise<{ plaintext: string; id: number }> {
  const plaintext = generateApiKey();
  const { rows } = await query<{ id: number }>(
    `INSERT INTO api_keys (label, key_hash) VALUES ($1, $2) RETURNING id`,
    [label, hashKey(plaintext)],
  );
  return { plaintext, id: rows[0].id };
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { rows } = await query<ApiKeyRow>(
    `SELECT id, label, created_at, last_used_at
       FROM api_keys
      ORDER BY created_at DESC`,
  );
  return rows;
}

// 直接刪除金鑰（不再保留已撤銷紀錄）。
export async function deleteApiKey(id: number): Promise<void> {
  await query(`DELETE FROM api_keys WHERE id = $1`, [id]);
}

// 驗證並節流更新 last_used_at；回傳該金鑰身分供建立者標記。
// H-4：改為「先 SELECT 驗證（無鎖）＋ 節流 UPDATE（每 5 分鐘至多一次）」，
// 避免每個 API request 都對同一列做 UPDATE 造成 row lock 競爭與 write IO 放大。
export async function authenticateApiKey(key: string): Promise<{ id: number; label: string } | null> {
  const hash = hashKey(key);
  const { rows } = await query<{ id: number; label: string }>(
    `SELECT id, label FROM api_keys WHERE key_hash = $1`,
    [hash],
  );
  if (rows.length === 0) return null;
  await query(
    `UPDATE api_keys
        SET last_used_at = now()
      WHERE key_hash = $1
        AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')`,
    [hash],
  );
  return rows[0];
}

// 從 Authorization: Bearer 或 ?apikey= 取出金鑰。
// SEC-005：金鑰不建議經由 URL query 傳遞（會洩漏至 access log／Referer），
// 僅在設定 ALLOW_API_KEY_QUERY=true 時才接受 query 方式。
export function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const v = auth.slice(7).trim();
    if (v) return v;
  }
  if (process.env.ALLOW_API_KEY_QUERY === "true") {
    const qp = new URL(req.url).searchParams.get("apikey");
    return qp?.trim() || null;
  }
  return null;
}
