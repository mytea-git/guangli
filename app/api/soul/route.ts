import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { scanSoulFiles } from "@/lib/soul/scan";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  try {
    const files = await scanSoulFiles();
    return NextResponse.json({ files });
  } catch (err) {
    console.error("[soul]", err);
    return NextResponse.json({ error: "扫描工作区失败" }, { status: 500 });
  }
}
