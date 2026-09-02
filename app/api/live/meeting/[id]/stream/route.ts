import { NextRequest } from "next/server";
import { getSession, isModerator } from "@/lib/auth";
import { registerStreamClose, subscribe } from "@/lib/stream";
import { canViewMeeting, getMeeting, isParticipant } from "@/lib/meetings";

// GET /api/live/meeting/:id/stream —— Server-Sent Events。
// 只送兩種事件：CHANGED（這場會議有東西變了，client 去重抓快照）與 heartbeat。
// 需登入；參與人與管理者皆可收聽。DB 為唯一事實來源（見 /api/live/meeting/:id 的 snapshot）。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("未登入", { status: 401 });

  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) return new Response("id 格式不正確", { status: 400 });
  const meetingId = Number(raw);

  const meeting = await getMeeting(meetingId);
  if (!meeting) return new Response("找不到會議", { status: 404 });

  // SEC-001：非管理員／非參與人不可訂閱即時推播。
  if (!canViewMeeting(meeting, session, isModerator(session), await isParticipant(meetingId, session.email))) {
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

  let closed = false;
  const unsubscribe = subscribe(meetingId, (event, payload) => {
    if (!closed) send(event, payload);
  });

  const cleanup = () => {
    closed = true;
    unsubscribe();
    clearInterval(heartbeat);
    unregisterClose();
  };

  // 心跳：避免 proxy 因閒置斷線
  const heartbeat = setInterval(() => {
    if (!closed) send("heartbeat", { t: Date.now() });
  }, 25000);

  // 關機（SIGINT/SIGTERM）時由 instrumentation.ts 主動收掉這條 stream，Next 的 server.close() 才等得完。
  const unregisterClose = registerStreamClose(() => {
    cleanup();
    try {
      controller.close();
    } catch {
      /* 已經關了 */
    }
  });

  request.signal.addEventListener("abort", cleanup, { once: true });

  send("connected", { meetingId });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
