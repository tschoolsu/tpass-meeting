import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type Role = "admin" | "moderator" | "default";
export type Restriction = "none" | "warning" | "ban";

export interface PermissionEntry {
  read: boolean;
  role: Role;
  restriction: Restriction;
  reason: string;
}

export interface TPassClaims {
  sub: string;
  email: string;
  name: string;
  permissions: Record<string, { read?: boolean; role?: string; restriction?: string; reason?: string }>;
  exp: number;
}

const serviceId = () => process.env.TPASS_SERVICE_ID || "meeting";
const issuer = () => process.env.JWT_ISSUER || "https://auth.tschoolsu.org";
const portalUrl = () => process.env.PORTAL_URL || "https://portal.tschoolsu.org/";

// 每次 request 只用一顆非同步 JWKS（jose 內部會快取公鑰並自動輪替）。
const jwks = () => createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL || "https://auth.tschoolsu.org/.well-known/jwks.json"));

export async function verifySession(token: string): Promise<TPassClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwks(), {
      algorithms: ["EdDSA"],                       // 鐵則 1：鎖死演算法，防 alg confusion
      issuer: issuer(),                            // 鐵則 2：核對簽發者
      audience: `tpass:${serviceId()}`,            // 鐵則 3：核對受眾，避免跨服務冒用
    });
    return {
      sub: String(payload.sub || ""),
      email: String(payload.email || "").toLowerCase(),
      name: String(payload.name || ""),
      permissions: (payload.permissions as TPassClaims["permissions"]) ?? {},
      exp: Number(payload.exp || 0),
    };
  } catch {
    return null; // 驗證失敗一律視為未登入，不回傳詳細錯誤
  }
}

export const getSession = cache(async (): Promise<TPassClaims | null> => {
  const jar = await cookies();
  const token = jar.get("tpass_token")?.value;
  if (!token) return null;
  return verifySession(token);
});

// 依 JWT permissions 決定權限。權限一律以「meeting」key 為準。
// role 只在 admin / moderator 之間有意義；restriction 獨立於 role 判斷管制狀態。
export function getPermissionEntry(session: TPassClaims | null | undefined): PermissionEntry {
  const entry = session?.permissions?.[serviceId()];
  const roleRaw = entry?.role ?? "default";
  const restrictionRaw = entry?.restriction ?? "none";
  const role: Role =
    roleRaw === "admin" || roleRaw === "moderator" ? roleRaw : "default";
  const restriction: Restriction =
    restrictionRaw === "warning" || restrictionRaw === "ban" ? restrictionRaw : "none";
  return {
    read: entry?.read !== false,
    role,
    restriction,
    reason: entry?.reason ?? "",
  };
}

export function isAdmin(session: TPassClaims | null | undefined): boolean {
  return getPermissionEntry(session).role === "admin";
}

export function isModerator(session: TPassClaims | null | undefined): boolean {
  const role = getPermissionEntry(session).role;
  return role === "moderator" || role === "admin";
}

export function loginUrlFor(returnPath = "/"): string {
  const u = new URL(process.env.AUTH_AUTHORIZE_URL || "https://auth.tschoolsu.org/api/auth/authorize");
  u.searchParams.set("service", serviceId());
  u.searchParams.set("redirect_uri", `${process.env.SERVICE_SELF_URL || "http://localhost:3009"}/api/auth/callback`);
  u.searchParams.set("next", returnPath);
  return u.toString();
}

// 頁面守門：未登入 → auth；ban / default（非 warning）→ portal；read=false → denied。
// warning 使用者（即使 role 是 default）仍可瀏覽，只會多跳出警告彈窗。
export async function requireAccess(returnPath = "/"): Promise<TPassClaims> {
  const session = await getSession();
  if (!session) redirect(loginUrlFor(returnPath));
  const perm = getPermissionEntry(session);
  if (perm.restriction === "ban") redirect(portalUrl());
  if (perm.role === "default" && perm.restriction !== "warning") redirect(portalUrl());
  if (!perm.read) redirect(`${process.env.AUTH_DENIED_URL || "https://auth.tschoolsu.org/denied"}?service=${serviceId()}`);
  return session;
}

// 建立／編輯／刪除會議需要 moderator 或 admin。
export async function requireManager(returnPath = "/"): Promise<TPassClaims> {
  const session = await requireAccess(returnPath);
  if (!isModerator(session)) redirect(portalUrl());
  return session;
}
