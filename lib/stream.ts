// 跨執行個體 / 跨 bundle 的即時廣播（SSE 用）。
//
// 為何用 Postgres LISTEN/NOTIFY 而非純記憶體 Map：
// Next.js 會把 server action 與 route handler 編譯成不同 bundle，各自載入一份本模組，
// 記憶體 Map 會重複 → chair 的 broadcast() 與 SSE route 的 subscribe() 落在不同實例，
// 事件永遠送不到。改走 DB 廣播：broadcast() 只發 pg_notify（跨任何 bundle/process），
// SSE route 所在 bundle 內部的共享 subscriber 集合作為唯一「會在該送出端點」的收件者。
//
// 同理，關機要用到的狀態（訂閱者、relay、要關的 SSE、stopping 旗標）全部掛在 globalThis：
// instrumentation.ts 的 signal handler 跟 SSE route 不在同一個 bundle，模組層的變數彼此看不到。
import "server-only";
import type { Client } from "pg";
import { listenClient, prisma } from "@/lib/db";

type Listener = (event: string, payload: unknown) => void;

const CHANNEL = "tpm_live";

interface StreamState {
  subscribers: Map<number, Set<Listener>>;
  relay: Promise<void> | null;
  // 每一條開著的 SSE 的關閉函式；關機時逐一呼叫，Next 的 server.close() 才收得完。
  closers: Set<() => void>;
  stopping: boolean;
}

const g = globalThis as unknown as { __tpmStream?: StreamState };
const state: StreamState =
  g.__tpmStream ?? (g.__tpmStream = { subscribers: new Map(), relay: null, closers: new Set(), stopping: false });

// 背景 relay：一條專用的 pg client 監聯 CHANNEL，收到通知後派給該會議的訂閱者。斷線 5 秒後重連；
// 關機（stopping）就不再重連、迴圈結束。
function ensureRelay(): Promise<void> {
  if (state.relay) return state.relay;
  state.relay = (async () => {
    while (!state.stopping) {
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
      if (!state.stopping) await sleep(5000);
    }
    state.relay = null;
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

// SSE route 建 stream 時登記「怎麼把這條收掉」；回傳取消登記（client 自己斷線時呼叫）。
// prod 下 SSE 永遠不會自己結束，沒有這個 Next 的 server.close() 永遠等不完、pm2 只能 SIGKILL。
export function registerStreamClose(fn: () => void): () => void {
  state.closers.add(fn);
  return () => {
    state.closers.delete(fn);
  };
}

// 關機：關掉所有 SSE、標記 stopping 讓 relay 不再重連。LISTEN 連線本身由 lib/db.ts 的 stopListen() 收。
export function closeAllStreams(): number {
  state.stopping = true;
  const fns = [...state.closers];
  state.closers.clear();
  for (const fn of fns) {
    try {
      fn();
    } catch {
      /* 能關就關 */
    }
  }
  return fns.length;
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
