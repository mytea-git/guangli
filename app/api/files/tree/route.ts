import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { getFileTree } from "@/lib/files/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  try {
    const tree = await getFileTree();
    return NextResponse.json(tree);
  } catch (err) {
    console.error("[files/tree]", err);
    return NextResponse.json({ error: "读取工作区失败" }, { status: 500 });
  }
}
