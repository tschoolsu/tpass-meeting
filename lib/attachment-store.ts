import "server-only";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
const UPLOAD_DIR = "uploads/agenda";

// 產生唯一檔名，避免覆蓋同名附件，也避免使用者可控路徑注入。
export function attachmentsDir(): string {
  return path.join(process.cwd(), UPLOAD_DIR);
}

export async function saveAttachment(file: File): Promise<{ path: string }> {
  const dir = attachmentsDir();
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}`;
  const storagePath = path.join(UPLOAD_DIR, name);
  await writeFile(path.join(process.cwd(), storagePath), Buffer.from(await file.arrayBuffer()));
  return { path: storagePath };
}

export async function deleteAttachmentFile(storagePath: string): Promise<void> {
  await rm(path.join(process.cwd(), storagePath), { force: true });
}
