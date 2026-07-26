// 只依赖 jose（基于 Web Crypto，edge runtime 可用），因此这个文件既能被
// Node 运行时的 API 路由使用，也能被 edge 运行时的 middleware.ts 直接导入，
// 不需要在两处各写一份校验逻辑。
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "guangli_session";
const SESSION_TTL = "7d";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // 允许本地 `npm run dev` 时不配置 .env 也能跑起来，
    // 但生产环境必须显式设置 AUTH_SECRET（见 .env.example 与部署文档）。
    console.warn(
      "[auth] 未设置 AUTH_SECRET，使用不安全的开发默认值。生产环境请务必在 .env 中配置。",
    );
    return new TextEncoder().encode("dev-insecure-secret-change-me-in-dot-env");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
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
