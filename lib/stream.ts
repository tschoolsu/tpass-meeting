// 跨執行個體 / 跨 bundle 的即時廣播（SSE 用）。
//
// 為何用 Postgres LISTEN/NOTIFY 而非純記憶體 Map：
// Next.js 會把 server action 與 route handler 編譯成不同 bundle，各自載入一份本模組，
// 記憶體 Map 會重複 → chair 的 broadcast() 與 SSE route 的 subscribe() 落在不同實例，
// 事件永遠送不到。改走 DB 廣播：broadcast() 只發 pg_notify（跨任何 bundle/process），
// SSE route 所在 bundle 內部的共享 subscriber 集合作為唯一「會在該送出端點」的收件者。
import "server-only";
import { pool } from "@/lib/db";

type Listener = (event: string, payload: unknown) => void;

const CHANNEL = "tpm_live";

// 同一模組實例內的订阅者集合（與 relay 同實例，確保能收到）。
const subscribers = new Map<number, Set<Listener>>();

let relay: Promise<void> | null = null;

// 背景 relay：一個專門的 pg client 監聽 CHANNEL，收到通知後派給該會議的订阅者。
function ensureRelay(): Promise<void> {
  if (relay) return relay;
  relay = (async () => {
    for (;;) {
      let client;
      try {
        client = await pool.connect();
      } catch (err) {
        console.error("[stream] 無法取得 DB 連線，5 秒後重試", err);
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
        const set = subscribers.get(data.meetingId);
        if (!set) return;
        const snapshot = [...set];
        for (const fn of snapshot) {
          try {
            fn(data.event, data.payload);
          } catch {
            /* 單一订阅者失敗不影響其他订阅者 */
          }
        }
      });

      client.on("error", () => {
        /* 交由下方 while loop 重連 */
      });

      try {
        await client.query(`LISTEN ${CHANNEL}`);
        // 每次通知處理完即回到此等待；斷線就跳出重連
        await new Promise<void>((resolve) => {
          const onEnd = () => {
            client.removeListener("notification", () => {});
            try {
              client.release(true);
            } catch {
              /* 已斷線可忽略 */
            }
            resolve();
          };
          client.once("end", onEnd);
          client.once("error", onEnd);
        });
      } catch (err) {
        console.error("[stream] LISTEN 失敗，5 秒後重連", err);
        try {
          client.release(true);
        } catch {
          /* ignore */
        }
        await sleep(5000);
      }
    }
  })();
  return relay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 訂閱某場會議；回傳取消訂閱的 cleanup function。
export function subscribe(meetingId: number, listener: Listener): () => void {
  ensureRelay();
  const set = subscribers.get(meetingId) ?? new Set<Listener>();
  set.add(listener);
  subscribers.set(meetingId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) subscribers.delete(meetingId);
  };
}

// 對該場會議的所有订阅者推播事件：透過 DB NOTIFY 送出（跨 bundle/process 皆可靠）。
export async function broadcast(meetingId: number, event: string, payload: unknown): Promise<void> {
  try {
    await pool.query(
      `SELECT pg_notify($1, $2)`,
      [CHANNEL, JSON.stringify({ meetingId, event, payload })],
    );
  } catch (err) {
    console.error(`[stream] broadcast 失敗（meeting ${meetingId}）`, err);
  }
}

// 供測試／重連使用：清空所有闭源码（伺服器重啟時用）。
export function _resetRelayForTesting(): void {
  relay = null;
}
