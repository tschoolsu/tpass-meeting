import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession, isModerator } from "@/lib/auth";
import { getAttachment } from "@/lib/agenda";
import { attachmentsDir } from "@/lib/attachment-store";
import { canViewMeeting, getMeeting, isParticipant } from "@/lib/meetings";

// GET /api/agenda/attachments/:id —— 下載議程附件（需登入且為該會議參與人／管理者）。
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) return NextResponse.json({ error: "id 格式不正確" }, { status: 400 });

  const att = await getAttachment(Number(raw));
  if (!att) return NextResponse.json({ error: "找不到附件" }, { status: 404 });

  // SEC-001：非管理員／非參與人不可下載附件。
  const meeting = await getMeeting(att.meeting_id);
  if (!meeting) return NextResponse.json({ error: "找不到附件" }, { status: 404 });
  if (!canViewMeeting(meeting, session, isModerator(session), await isParticipant(att.meeting_id, session.email))) {
    return NextResponse.json({ error: "找不到附件" }, { status: 404 });
  }

  // SEC-004：確保解析後路徑位於上傳目錄內，防止路徑穿越讀取任意檔案。
  const resolved = path.resolve(process.cwd(), att.storage_path);
  const root = path.resolve(attachmentsDir());
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return NextResponse.json({ error: "附件檔案不存在" }, { status: 404 });
  }

  try {
    const buffer = await readFile(resolved);
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
