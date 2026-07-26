import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    return NextResponse.json({ authenticated: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    throw err;
  }
}
