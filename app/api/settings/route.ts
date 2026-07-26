import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { getSettings, updateSettings, SettingsSchema } from "@/lib/store/settings";
import { redactSettings as redact } from "@/lib/store/settingsRedact";

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
