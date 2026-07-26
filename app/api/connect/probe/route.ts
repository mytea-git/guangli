import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { checkRateLimit, clientIpFrom } from "@/lib/auth/rateLimit";
import { getSettings } from "@/lib/store/settings";

export const runtime = "nodejs";

const PROBE_TIMEOUT_MS = 5000;

/**
 * 连接区 iframe 的可达性探测。CSP 的 `connect-src 'self'` 不允许浏览器
 * 端直接向任意跨域地址发 fetch（这正是我们希望保留的默认收紧行为），
 * 所以探测改在服务端做——同源接口不受该限制，也不需要为了这一个功能
 * 放宽全站的 connect-src。
 *
 * 故意只探测 settings 里已保存的 connect.url，不接受客户端传入的任意
 * url 参数：否则这个接口本身会变成一个通用的服务端 SSRF 探测工具。
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const rl = checkRateLimit(`connect-probe:${clientIpFrom(req)}`, { windowMs: 60_000, maxAttempts: 30 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const settings = await getSettings();
  const url = settings.connect.url;
  if (!settings.connect.enabled || !url) {
    return NextResponse.json({ reachable: false });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // 只关心网络层是否连通，不关心响应内容/状态码——哪怕目标返回
    // 4xx/5xx 也说明地址本身是可达的，与客户端原先 no-cors 探测的语义一致。
    await fetch(url, { signal: controller.signal, method: "GET" });
    return NextResponse.json({ reachable: true });
  } catch {
    return NextResponse.json({ reachable: false });
  } finally {
    clearTimeout(timer);
  }
}
