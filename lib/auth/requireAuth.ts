import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export class AuthError extends Error {
  constructor(message = "未授权") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * 纵深防御：middleware.ts 已经拦截了大部分未授权请求，但每个 API
 * 路由处理函数仍应显式再校验一次一一不单独信任 middleware（历史上
 * Next.js 曾出现过 middleware matcher 被绕过的安全漏洞）。
 */
export async function requireAuth(req: NextRequest): Promise<void> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionToken(token);
  if (!ok) throw new AuthError();
}
