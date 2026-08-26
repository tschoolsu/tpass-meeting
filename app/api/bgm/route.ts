import { NextResponse } from "next/server";
import { createReadStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { getSession } from "@/lib/auth";
import { bgmPath } from "@/lib/bgm";

export const runtime = "nodejs";

// GET /api/bgm —— 串流會議 BGM（需登入）。瀏覽器播放時會帶上 Cookie。
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const file = bgmPath();
  if (!existsSync(file)) return new NextResponse("Not found", { status: 404 });

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "private, max-age=300",
    },
  });
}
