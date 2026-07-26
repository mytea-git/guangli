import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { checkRateLimit, clientIpFrom } from "@/lib/auth/rateLimit";
import { refreshCatalog } from "@/lib/models/catalog";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  // 联网获取会向外部模型目录发请求，限制得比普通 API 更紧：每 IP 每分钟 10 次。
  const rl = checkRateLimit(`models-refresh:${clientIpFrom(req)}`, { windowMs: 60_000, maxAttempts: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const catalog = await refreshCatalog();
  return NextResponse.json({ catalog });
}
