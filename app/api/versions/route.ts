import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { listVersions, type VersionKind } from "@/lib/versions/store";

export const runtime = "nodejs";

function isValidKind(v: string | null): v is VersionKind {
  return v === "workspace" || v === "data";
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const kind = req.nextUrl.searchParams.get("kind");
  const relPath = req.nextUrl.searchParams.get("path");
  if (!isValidKind(kind) || !relPath) {
    return NextResponse.json({ error: "缺少或非法的 kind/path 参数" }, { status: 400 });
  }

  const versions = await listVersions(kind, relPath);
  return NextResponse.json({ versions });
}
