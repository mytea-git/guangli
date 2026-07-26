import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { checkGeneralApiRateLimit } from "@/lib/auth/rateLimit";
import { getProvider } from "@/lib/providers";
import { updateSettings } from "@/lib/store/settings";

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

  const rl = checkGeneralApiRateLimit(req);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }

  const controls = getProvider().controls();
  if (!controls) {
    return NextResponse.json({ error: "当前数据源不支持模拟控制" }, { status: 409 });
  }

  // 除了驱动内存中的引擎，还要把结果写回 settings.json：
  // 1) 设置页刷新后能看到真实的暂停/倍速状态，而不是过期的默认值
  // 2) 服务重启后引擎能重新应用这个状态（对齐 M5 activeModel 的做法）
  switch (parsed.data.action) {
    case "pause":
      controls.pause();
      await updateSettings({ mock: { paused: true } });
      break;
    case "resume":
      controls.resume();
      await updateSettings({ mock: { paused: false } });
      break;
    case "reset":
      controls.reset();
      break;
    case "setSpeed":
      if (!parsed.data.speed) {
        return NextResponse.json({ error: "缺少 speed 参数" }, { status: 400 });
      }
      controls.setSpeed(parsed.data.speed);
      await updateSettings({ mock: { speed: parsed.data.speed } });
      break;
  }

  return NextResponse.json({ ok: true });
}
