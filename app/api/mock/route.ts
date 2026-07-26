import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { getProvider } from "@/lib/providers";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["pause", "resume", "reset", "setSpeed"]),
  speed: z.union([z.literal(0.5), z.literal(1), z.literal(2), z.literal(4)]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }

  const controls = getProvider().controls();
  if (!controls) {
    return NextResponse.json({ error: "当前数据源不支持模拟控制" }, { status: 409 });
  }

  switch (parsed.data.action) {
    case "pause":
      controls.pause();
      break;
    case "resume":
      controls.resume();
      break;
    case "reset":
      controls.reset();
      break;
    case "setSpeed":
      if (!parsed.data.speed) {
        return NextResponse.json({ error: "缺少 speed 参数" }, { status: 400 });
      }
      controls.setSpeed(parsed.data.speed);
      break;
  }

  return NextResponse.json({ ok: true });
}
