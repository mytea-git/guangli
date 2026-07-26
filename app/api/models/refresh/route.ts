import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { refreshCatalog } from "@/lib/models/catalog";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const catalog = await refreshCatalog();
  return NextResponse.json({ catalog });
}
