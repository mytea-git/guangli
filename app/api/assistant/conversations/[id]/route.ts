import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { checkGeneralApiRateLimit } from "@/lib/auth/rateLimit";
import { getConversation, deleteConversation } from "@/lib/assistant/store";

export const runtime = "nodejs";

async function checkAuth(req: NextRequest) {
  try {
    await requireAuth(req);
    return null;
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }
}

// Next.js 15：route params 是 Promise，需要 await。
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  return NextResponse.json(conv);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;

  const rl = checkGeneralApiRateLimit(req);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { id } = await params;
  await deleteConversation(id);
  return NextResponse.json({ ok: true });
}
