import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";

export interface ApiKeyRow {
  id: number;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  return `tpm_${randomBytes(24).toString("base64url")}`;
}

// 建立後只回傳一次明碼，資料庫只存雜湊。
export async function createApiKey(label: string): Promise<string> {
  const plaintext = generateApiKey();
  await query(`INSERT INTO api_keys (label, key_hash) VALUES ($1, $2)`, [
    label,
    hashKey(plaintext),
  ]);
  return plaintext;
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { rows } = await query<ApiKeyRow>(
    `SELECT id, label, created_at, last_used_at, revoked
       FROM api_keys
      ORDER BY created_at DESC`,
  );
  return rows;
}

export async function revokeApiKey(id: number): Promise<void> {
  await query(`UPDATE api_keys SET revoked = TRUE WHERE id = $1`, [id]);
}

// 驗證並更新 last_used_at；回傳該金鑰身分供建立者標記。
export async function authenticateApiKey(key: string): Promise<{ id: number; label: string } | null> {
  const { rows } = await query<{ id: number; label: string }>(
    `UPDATE api_keys
        SET last_used_at = now()
      WHERE key_hash = $1 AND NOT revoked
      RETURNING id, label`,
    [hashKey(key)],
  );
  return rows[0] ?? null;
}

// 從 Authorization: Bearer 或 ?apikey= 取出金鑰。
export function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const v = auth.slice(7).trim();
    if (v) return v;
  }
  const qp = new URL(req.url).searchParams.get("apikey");
  return qp?.trim() || null;
}
