import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { getSettings, updateSettings, SettingsSchema, type Settings } from "@/lib/store/settings";

export const runtime = "nodejs";

// apiKey 只应停留在服务端；对客户端一律打码，只暴露"是否已配置"。
function redact(settings: Settings) {
  const { assistant, ...rest } = settings;
  const { apiKey: _apiKey, ...assistantRest } = assistant;
  void _apiKey;
  return {
    ...rest,
    assistant: { ...assistantRest, hasApiKey: Boolean(assistant.apiKey) },
  };
}

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
  return NextResponse.json(redact(settings));
}

export async function PUT(req: NextRequest) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const parsed = SettingsSchema.deepPartial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }
  const next = await updateSettings(parsed.data);
  return NextResponse.json(redact(next));
}
