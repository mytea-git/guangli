import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { getAuthRecord, setPassword } from "@/lib/store/auth";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256),
});

export async function PUT(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "新密码至少需要 8 位" }, { status: 400 });
  }

  const record = await getAuthRecord();
  const ok = await verifyPassword(parsed.data.currentPassword, record.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "当前密码不正确" }, { status: 401 });
  }

  await setPassword(parsed.data.newPassword);

  // 改密码后强制重新登录：清除当前会话 cookie。
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
