import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请求参数无效" }, { status: 400 });

  try {
    await restoreVersion(parsed.data.kind, parsed.data.path, parsed.data.versionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PathViolation) return NextResponse.json({ error: "非法路径" }, { status: 403 });
    console.error("[versions/restore]", err);
    return NextResponse.json({ error: (err as Error).message || "恢复失败" }, { status: 500 });
  }
}
