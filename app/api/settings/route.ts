import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { checkGeneralApiRateLimit } from "@/lib/auth/rateLimit";
import { getSettings, updateSettings, SettingsSchema } from "@/lib/store/settings";
import { redactSettings as redact } from "@/lib/store/settingsRedact";
import { getWorkspaceRoot } from "@/lib/files/service";
import { getProvider } from "@/lib/providers";

export const runtime = "nodejs";

async function checkAuth(req: NextRequest) {
  try {
    await requireAuth(req);
    return null;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;
  const settings = await getSettings();
  const workspaceRoot = await getWorkspaceRoot();
  // workspaceRoot 不再是 settings.json 里的字段（见 lib/store/settings.ts
  // 顶部注释：可写的沙箱根会让 resolveSafe() 形同虚设），这里单独附加到
  // 响应里仅供设置页只读展示，PUT 不接受这个字段。
  return NextResponse.json({ ...redact(settings), workspaceRoot });
}

export async function PUT(req: NextRequest) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;

  const rl = checkGeneralApiRateLimit(req);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SettingsSchema.deepPartial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }
  const next = await updateSettings(parsed.data);

  // 时区变化要立刻反映到用量归档的日期边界上，不必等进程重启——
  // 其它字段（activeModel/mock.speed/mock.paused）已经各自有专门的
  // 路由（models/activate、mock）在写settings的同时调用 controls()，
  // 时区只能在这里改（设置页没有独立的时区切换端点）。
  getProvider().controls()?.setTimezone(next.timezone);

  const workspaceRoot = await getWorkspaceRoot();
  return NextResponse.json({ ...redact(next), workspaceRoot });
}
