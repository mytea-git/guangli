import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export const config = {
  // /monaco/* 是自托管的 Monaco 编辑器静态资源（public/monaco，见
  // scripts/copy-monaco-assets.mjs），不含任何敏感数据，同 _next/static
  // 一样不需要鉴权，否则编辑器的懒加载语言 worker 请求会被 307 到登录页。
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monaco/).*)"],
};

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);
  if (authed) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}
