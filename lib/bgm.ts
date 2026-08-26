import "server-only";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const BGM_FILE = "bgm.mp3";
export const MAX_BGM_BYTES = 10 * 1024 * 1024; // 10 MB

export const bgmPath = (): string => path.join(process.cwd(), "uploads", BGM_FILE);

export async function hasBgm(): Promise<boolean> {
  try {
    const s = await stat(bgmPath());
    return s.isFile();
  } catch {
    return false;
  }
}

export async function saveBgm(buffer: Buffer): Promise<void> {
  await mkdir(path.dirname(bgmPath()), { recursive: true });
  await writeFile(bgmPath(), buffer);
}

export async function clearBgm(): Promise<void> {
  await rm(bgmPath(), { force: true });
}

export async function bgmInfo(): Promise<{ size: number; updated_at: string } | null> {
  try {
    const s = await stat(bgmPath());
    if (!s.isFile()) return null;
    return { size: s.size, updated_at: s.mtime.toISOString() };
  } catch {
    return null;
  }
}
