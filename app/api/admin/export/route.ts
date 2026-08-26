import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { exportAll } from "@/lib/backup";

export const runtime = "nodejs";

// GET /api/admin/export —— 匯出全部會議紀錄（僅 admin）。
export async function GET() {
  await requireAdmin("/panel");
  const data = await exportAll();
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="meetings-${today}.json"`,
      "cache-control": "no-store",
    },
  });
}
