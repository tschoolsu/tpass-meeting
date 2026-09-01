// 頁面／API 的登入與權限守門。驗章本體在 tpass-auth-js（見 config/auth.ts），
// 這裡只是把套件的 session 與 permissions 轉成本服務習慣的 API 形狀。
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { TPassClaims } from "tpass-auth-js";
import { authConfig, tpass } from "@/config/auth";

export type { TPassClaims };

export type Role = "admin" | "moderator" | "default";
export type Restriction = "none" | "warning" | "ban";

// 本服務用的權限形狀：欄位全部必填（套件的 restriction / reason 是選填）。
export interface PermissionEntry {
  read: boolean;
  role: Role;
  restriction: Restriction;
  reason: string;
}

// 同一個 request 內只驗一次章。
export const getSession = cache((): Promise<TPassClaims | null> => tpass.getSession());

// 依 JWT permissions 決定權限。權限一律以本服務 id 為 key。
// role 只認 admin / moderator，其餘視為 default；restriction 只認 warning / ban，其餘視為 none。
export function getPermissionEntry(session: TPassClaims | null | undefined): PermissionEntry {
  const perm = tpass.permOf(session);
  const role: Role =
    perm.role === "admin" || perm.role === "moderator" ? perm.role : "default";
  const restriction: Restriction =
    perm.restriction === "warning" || perm.restriction === "ban" ? perm.restriction : "none";
  return {
    read: perm.read !== false,
    role,
    restriction,
    reason: perm.reason ?? "",
  };
}

export function isAdmin(session: TPassClaims | null | undefined): boolean {
  return getPermissionEntry(session).role === "admin";
}

export function isModerator(session: TPassClaims | null | undefined): boolean {
  const role = getPermissionEntry(session).role;
  return role === "moderator" || role === "admin";
}

// 登入回跳路徑可帶站內路徑，組成 authorize 入口（契約 v2）。
export function loginUrlFor(returnPath = "/"): string {
  return tpass.loginUrl(returnPath);
}

// 頁面守門：未登入 → auth；ban → portal；read=false → denied。
// 一般學生（default 非 warning）也可瀏覽，但僅能存取自己受邀的會議（需求：T-Pass 入口）。
export async function requireAccess(returnPath = "/"): Promise<TPassClaims> {
  const session = await getSession();
  if (!session) redirect(tpass.loginUrl(returnPath));
  const perm = getPermissionEntry(session);
  if (perm.restriction === "ban") redirect(authConfig.portalUrl);
  if (!perm.read) redirect(tpass.deniedUrl());
  return session;
}

// 建立／編輯／刪除會議需要 moderator 或 admin。
export async function requireManager(returnPath = "/"): Promise<TPassClaims> {
  const session = await requireAccess(returnPath);
  if (!isModerator(session)) redirect(authConfig.portalUrl);
  return session;
}

// 管理面板與進階管理功能只有 admin。
export async function requireAdmin(returnPath = "/panel"): Promise<TPassClaims> {
  const session = await requireAccess(returnPath);
  if (!isAdmin(session)) redirect(authConfig.portalUrl);
  return session;
}
