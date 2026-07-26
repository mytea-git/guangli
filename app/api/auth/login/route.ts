import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthRecord } from "@/lib/store/auth";
import { verifyPassword } from "@/lib/auth/password";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rateLimit";

export const runtime = "nodejs";

const bodySchema = z.object({ password: z.string().min(1).max(256) });

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = checkRateLimit(`login:${ip}`);
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

  const record = await getAuthRecord();
  const ok = await verifyPassword(parsed.data.password, record.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const token = await signSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
