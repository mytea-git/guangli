// 只依赖 jose（基于 Web Crypto，edge runtime 可用），因此这个文件既能被
// Node 运行时的 API 路由使用，也能被 edge 运行时的 middleware.ts 直接导入，
// 不需要在两处各写一份校验逻辑。
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "guangli_session";
const SESSION_TTL = "7d";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MIN_SECRET_LENGTH = 32;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) {
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV === "production") {
    // 生产环境绝不能静默回退到一个源码里可见的默认密钥——那等于
    // 任何人都能伪造管理员 JWT。宁可让请求失败（signSession 抛错会
    // 让登录路由 500；verifySessionToken 内部会把这个异常当作校验
    // 失败处理，等效于"所有会话一律视为未登录"），也不要带着不安全的
    // 密钥继续提供服务。
    throw new Error(
      "[auth] AUTH_SECRET 未设置或长度不足（需 ≥32 字符）。生产环境拒绝使用不安全的默认密钥，" +
        "请在 .env 中配置足够随机的 AUTH_SECRET（如 openssl rand -base64 48）。",
    );
  }

  // 仅开发环境：允许本地 `npm run dev` 时不配置 .env 也能跑起来。
  console.warn(
    "[auth] 未设置 AUTH_SECRET（或长度不足 32 字符），使用不安全的开发默认值。生产环境请务必在 .env 中配置。",
  );
  return new TextEncoder().encode("dev-insecure-secret-change-me-in-dot-env");
}

export async function signSession(tokenVersion: number): Promise<string> {
  return new SignJWT({ role: "admin", v: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

/** 仅校验签名+过期时间，不做版本比对——中间件（edge runtime）用这个快速判断。 */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

/**
 * 校验 token 并取出其中的版本号（每次改密码都会递增）。仅供 Node 运行时的
 * requireAuth 使用——中间件只做签名+过期校验，不在 edge runtime 里引入
 * "读取 auth.json 比对版本号"这样的文件 I/O。
 *
 * 效果：改密码后，其它设备上尚未过期的旧 token 在 edge 中间件这一关仍会
 * 放行（可能看到一次页面外壳），但只要发出任何需要 requireAuth() 的 API
 * 请求（几乎是所有实际操作：SSE、设置、文件、助手对话……）就会被拒绝，
 * 前端现有的 401 处理会把它导回登录页——不需要改动中间件的运行时环境
 * 也能做到"改密码即让其它会话失效"。
 */
export async function verifySessionTokenVersion(token: string | undefined | null): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const v = (payload as { v?: unknown }).v;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  const trustProxy = process.env.TRUST_PROXY === "1";
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: trustProxy,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
