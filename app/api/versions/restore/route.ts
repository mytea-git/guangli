import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { checkGeneralApiRateLimit } from "@/lib/auth/rateLimit";
import { restoreVersion } from "@/lib/versions/store";
import { PathViolation } from "@/lib/files/sandbox";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["workspace", "data"]),
  path: z.string().min(1).max(1024),
  versionId: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const rl = checkGeneralApiRateLimit(req);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请求参数无效" }, { status: 400 });

  try {
    await restoreVersion(parsed.data.kind, parsed.data.path, parsed.data.versionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PathViolation) return NextResponse.json({ error: "非法路径" }, { status: 403 });
    console.error("[versions/restore]", err);
    // 不直接把 err.message 透传给客户端——未预期的文件系统错误
    // （如 ENOENT）message 里常常带着服务器上的绝对路径。已知的
    // "版本不存在" 之外，一律返回通用错误，详情只进服务端日志。
    const message = err instanceof Error && err.message === "版本不存在" ? err.message : "恢复失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
