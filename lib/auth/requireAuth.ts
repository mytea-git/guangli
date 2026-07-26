import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionTokenVersion } from "./session";
import { getAuthRecord } from "@/lib/store/auth";

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
 *
 * 这里比中间件多做一步版本号比对：token 里携带的 `v` 必须等于
 * auth.json 当前记录的 tokenVersion，改密码会让 tokenVersion 递增，
 * 从而让所有旧 token（不管在哪个设备/浏览器上）立即失效，而不是
 * 等 7 天自然过期。中间件运行在 edge runtime、不便读本地文件，
 * 版本比对因此只放在这里（Node runtime）做。
 */
export async function requireAuth(req: NextRequest): Promise<void> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const version = await verifySessionTokenVersion(token);
  if (version === null) throw new AuthError();

  const record = await getAuthRecord();
  if (version !== record.tokenVersion) throw new AuthError();
}
