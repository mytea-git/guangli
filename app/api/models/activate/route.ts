import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { updateSettings } from "@/lib/store/settings";
import { getProvider } from "@/lib/providers";

export const runtime = "nodejs";

const bodySchema = z.object({ modelId: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请求参数无效" }, { status: 400 });

  await updateSettings({ activeModel: parsed.data.modelId });
  getProvider().controls()?.setActiveModel(parsed.data.modelId);

  return NextResponse.json({ ok: true, activeModel: parsed.data.modelId });
}
