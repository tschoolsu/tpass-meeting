import { NextResponse } from "next/server";

// GET /api/health —— liveness/readiness 檢查（M-8）：確認 DB 可連。
// 給 pm2 / 外部監控定期打；不做任何資料操作。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  try {
    const { pool } = await import("@/lib/db");
    await pool.query("SELECT 1");
    return NextResponse.json({ status: "ok", db: "ok", latency_ms: Date.now() - startedAt });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "error",
        error: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
