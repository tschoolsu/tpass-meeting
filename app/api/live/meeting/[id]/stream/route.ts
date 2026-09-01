import { NextRequest } from "next/server";
import { getSession, isModerator } from "@/lib/auth";
import { subscribe } from "@/lib/stream";
import { canViewMeeting, getMeetingDetail, isParticipant } from "@/lib/meetings";

// GET /api/live/meeting/:id/stream —— Server-Sent Events：表決狀態即時推播（需求：表決動態即時更新）。
// 需登入；參與人與管理者皆可收聽。DB 為唯一事實來源（見 /api/live/meeting/:id 的 snapshot）。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("未登入", { status: 401 });

  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) return new Response("id 格式不正確", { status: 400 });
  const meetingId = Number(raw);

  const detail = await getMeetingDetail(meetingId);
  if (!detail) return new Response("找不到會議", { status: 404 });

  // SEC-001：非管理員／非參與人不可訂閱即時推播。
  if (!canViewMeeting(detail.meeting, session, isModerator(session), await isParticipant(meetingId, session.email))) {
    return new Response("找不到會議", { status: 404 });
  }

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {},
  });

  const enc = (s: string) => new TextEncoder().encode(s);
  const send = (event: string, data: unknown) => {
    try {
      controller.enqueue(enc(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch {
      /* 客戶端已斷線 */
    }
  };

  // 訂閱並訂定清理邏輯
  let closed = false;
  const unsubscribe = subscribe(meetingId, (event, payload) => {
    if (!closed) send(event, payload);
  });

  const cleanup = () => {
    closed = true;
    unsubscribe();
    clearInterval(heartbeat);
  };

  // 心跳：避免 proxy 因閒置斷線
  const heartbeat = setInterval(() => {
    if (!closed) send("heartbeat", { t: Date.now() });
  }, 25000);

  request.signal.addEventListener("abort", cleanup, { once: true });

  // 連線建立後立即補目前狀態（前端一接上就能當場看到已開放的案）
  const initial = detail.agenda
    .flatMap((a) =>
      a.motions.map((m) => ({
        id: m.id,
        agenda_item_id: m.agenda_item_id,
        title: m.title,
        threshold: m.threshold,
        status: m.status,
        agree: m.agree,
        against: m.against,
      })),
    )
    .find((m) => m.status === "open");

  send("connected", { meetingId, current: initial });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
