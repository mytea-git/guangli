import { getGlobalSingleton } from "@/lib/utils/globalSingleton";

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

function buckets(): Map<string, Bucket> {
  return getGlobalSingleton("rateLimitBuckets", () => {
    const map = new Map<string, Bucket>();
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of map) {
        if (bucket.resetAt < now) map.delete(key);
      }
    }, CLEANUP_INTERVAL_MS);
    timer.unref?.();
    return map;
  });
}

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const map = buckets();
  const now = Date.now();
  const bucket = map.get(key);

  if (!bucket || bucket.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}
