import { getGlobalSingleton } from "@/lib/utils/globalSingleton";

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

// 不同限流场景共用一张桶表，但用 key 前缀区分命名空间（login: / api: 等），
// 所以同一个 IP 在登录限流和普通 API 限流之间不会互相干扰计数。
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

export interface RateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
}

export function checkRateLimit(
  key: string,
  opts?: RateLimitOptions,
): { allowed: boolean; retryAfterSec: number } {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const map = buckets();
  const now = Date.now();
  const bucket = map.get(key);

  if (!bucket || bucket.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.count >= maxAttempts) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * 从请求头取客户端 IP，用于按 IP 限流。
 *
 * 只有 TRUST_PROXY=1（生产环境经 Caddy 反代部署）时才读取
 * `X-Forwarded-For`，并且只取最右一跳——反代（Caddy）会把自己直接
 * 观测到的对端地址追加在已有 XFF 值之后，而不是替换它，所以最左边的
 * 值可能是客户端自己塞入的伪造值，必须取最右边这一跳才是反代真正
 * 看到的连接来源。
 *
 * 未设置 TRUST_PROXY（本地开发、或没有反代的直连部署）时完全不信任
 * 这个头——否则任何直连客户端都能随意伪造 XFF，让每个请求落入全新的
 * 限流桶，使登录爆破限流形同虚设。这种情况下退化为固定 key（所有
 * 直连请求共享同一个桶）：更保守，但不会被绕过。
 */
export function clientIpFrom(req: { headers: { get(name: string): string | null } }): string {
  if (process.env.TRUST_PROXY === "1") {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const hops = xff
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (hops.length > 0) return hops[hops.length - 1];
    }
  }
  return "local";
}

/**
 * 通用 API 限流：每 IP 每分钟 120 次，用于写操作/触发外部请求的端点
 * （文件创建删除重命名、AI 助手对话、联网获取模型目录等）。返回值
 * 直接是 Response（429）或 null（放行），调用方一行接入。
 */
export function checkGeneralApiRateLimit(req: { headers: { get(name: string): string | null } }): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const ip = clientIpFrom(req);
  return checkRateLimit(`api:${ip}`, { windowMs: 60_000, maxAttempts: 120 });
}
