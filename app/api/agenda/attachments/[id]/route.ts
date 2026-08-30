import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { getAttachment } from "@/lib/agenda";

// GET /api/agenda/attachments/:id —— 下載議程附件（需登入）。
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) return NextResponse.json({ error: "id 格式不正確" }, { status: 400 });

  const att = await getAttachment(Number(raw));
  if (!att) return NextResponse.json({ error: "找不到附件" }, { status: 404 });

  try {
    const buffer = await readFile(path.join(process.cwd(), att.storage_path));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": att.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "附件檔案不存在" }, { status: 404 });
  }
}
