// 記憶體級 per-meeting 廣播樞紐（SSE 用）：
// server 端的表決狀態事件（VOTE_STARTED / VOTE_CLOSED / …）透過這裡推給所有在線訂閱者。
// 注意：此模組 `"server-only"`，只能在 server component / route handler 中匯入。
import "server-only";

type Listener = (event: string, payload: unknown) => void;

const channels = new Map<number, Set<Listener>>();

// 訂閱某場會議；回傳取消訂閱的 cleanup function。
export function subscribe(meetingId: number, listener: Listener): () => void {
  const set = channels.get(meetingId) ?? new Set<Listener>();
  set.add(listener);
  channels.set(meetingId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) channels.delete(meetingId);
  };
}

// 對該場會議的所有訂閱者推播事件。
export function broadcast(meetingId: number, event: string, payload: unknown): void {
  const set = channels.get(meetingId);
  if (!set) return;
  const snapshot = [...set];
  for (const fn of snapshot) {
    try {
      fn(event, payload);
    } catch {
      // 單一訂閱者失敗不影響其他訂閱者
    }
  }
}
