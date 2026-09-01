import "server-only";

// H-5：極簡 in-memory sliding-window rate limit。
// 適用情境：目前部署是單 process（pm2 fork ×1），in-memory 即一致；
// 未來多 instance 需換成 Redis 等共享儲存。
// 目的只是「擋掉明顯的濫用尖峰」，不是精確的帳務級限流，數字給寬。

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export function rateLimitByKey(key: string, maxPerWindow: number): RateLimitResult {
  const now = Date.now();
  let hits = buckets.get(key) ?? [];

  // 過濾過期 hit（sliding window）
  if (hits.length > 0 && hits[0] < now - WINDOW_MS) {
    hits = hits.filter((t) => now - t < WINDOW_MS);
  }

  if (hits.length >= maxPerWindow) {
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + WINDOW_MS - now) / 1000));
    buckets.set(key, hits);
    return { allowed: false, retryAfterSec };
  }

  hits.push(now);
  buckets.set(key, hits);

  // 防記憶體無限增長：bucket 太多時清掉已過期的 key。
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, list] of buckets) {
      if (list.length === 0 || list[list.length - 1] < now - WINDOW_MS) buckets.delete(k);
    }
  }

  return { allowed: true, retryAfterSec: 0 };
}
