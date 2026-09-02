// 跨執行個體 / 跨 bundle 的即時廣播（SSE 用）。
//
// 為何用 Postgres LISTEN/NOTIFY 而非純記憶體 Map：
// Next.js 會把 server action 與 route handler 編譯成不同 bundle，各自載入一份本模組，
// 記憶體 Map 會重複 → chair 的 broadcast() 與 SSE route 的 subscribe() 落在不同實例，
// 事件永遠送不到。改走 DB 廣播：broadcast() 只發 pg_notify（跨任何 bundle/process），
// SSE route 所在 bundle 內部的共享 subscriber 集合作為唯一「會在該送出端點」的收件者。
//
// 訂閱者與 relay 掛在 globalThis：不同 bundle 各載一份本模組時仍共用同一份狀態。
import "server-only";
import type { Client } from "pg";
import { listenClient, prisma } from "@/lib/db";

type Listener = (event: string, payload: unknown) => void;

const CHANNEL = "tpm_live";

interface StreamState {
  subscribers: Map<number, Set<Listener>>;
  relay: Promise<void> | null;
}

const g = globalThis as unknown as { __tpmStream?: StreamState };
const state: StreamState =
  g.__tpmStream ?? (g.__tpmStream = { subscribers: new Map(), relay: null });

// 背景 relay：一條專用的 pg client 監聯 CHANNEL，收到通知後派給該會議的訂閱者。斷線 5 秒後重連。
function ensureRelay(): Promise<void> {
  if (state.relay) return state.relay;
  state.relay = (async () => {
    for (;;) {
      let client: Client;
      try {
        client = await listenClient();
      } catch (err) {
        console.error("[stream] 無法建立 LISTEN 連線，5 秒後重試", err);
        await sleep(5000);
        continue;
      }

      client.on("notification", (msg) => {
        if (!msg.payload) return;
        let data: { meetingId: number; event: string; payload: unknown };
        try {
          data = JSON.parse(msg.payload);
        } catch {
          return;
        }
        const set = state.subscribers.get(data.meetingId);
        if (!set) return;
        for (const fn of [...set]) {
          try {
            fn(data.event, data.payload);
          } catch {
            /* 單一訂閱者失敗不影響其他訂閱者 */
          }
        }
      });

      try {
        await client.query(`LISTEN ${CHANNEL}`);
        // 佇在這裡直到連線結束（error handler 在 lib/db.ts 掛好了，這裡只等 end）
        await new Promise<void>((resolve) => {
          client.once("end", () => resolve());
          client.once("error", () => resolve());
        });
      } catch (err) {
        console.error("[stream] LISTEN 失敗，5 秒後重連", err);
      }
      try {
        await client.end();
      } catch {
        /* 已斷線可忽略 */
      }
      await sleep(5000);
    }
  })();
  return state.relay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms);
    // 不讓等待重連的計時器擋住 process 正常退出
    t.unref?.();
  });
}

// 訂閱某場會議；回傳取消訂閱的 cleanup function。
export function subscribe(meetingId: number, listener: Listener): () => void {
  void ensureRelay();
  const set = state.subscribers.get(meetingId) ?? new Set<Listener>();
  set.add(listener);
  state.subscribers.set(meetingId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) state.subscribers.delete(meetingId);
  };
}

// 對該場會議的所有訂閱者推播事件：透過 DB NOTIFY 送出（跨 bundle/process 皆可靠）。
export async function broadcast(meetingId: number, event: string, payload: unknown): Promise<void> {
  try {
    const message = JSON.stringify({ meetingId, event, payload });
    await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${message})`;
  } catch (err) {
    console.error(`[stream] broadcast 失敗（meeting ${meetingId}）`, err);
  }
}

// 「這場會議有東西變了，請立刻重抓快照」。唯一的事件種類——
// 以前分 VOTE_STARTED / VOTE_CLOSED 各自在 client 局部合併，合併邏輯就是 bug 來源；
// 快照（/api/live/meeting/:id）本來就是唯一事實來源，SSE 只當鈴聲。
export function notifyMeetingChanged(meetingId: number, reason: string): Promise<void> {
  return broadcast(meetingId, "CHANGED", { reason, at: Date.now() });
}
