import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { checkRateLimit, clientIpFrom } from "@/lib/auth/rateLimit";
import { restoreAllToPreviousVersion } from "@/lib/versions/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  // 影响面最大的一个操作（一次性回滚所有被追踪的文件），限得比单文件
  // 恢复更紧：每 IP 每分钟 5 次。
  const rl = checkRateLimit(`restore-all:${clientIpFrom(req)}`, { windowMs: 60_000, maxAttempts: 5 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const result = await restoreAllToPreviousVersion();
  return NextResponse.json(result);
}
