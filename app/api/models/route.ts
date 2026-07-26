import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { readOpenClawConfig } from "@/lib/models/openclawConfig";
import { getCachedCatalog } from "@/lib/models/catalog";
import { getSettings } from "@/lib/store/settings";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const [config, catalog, settings] = await Promise.all([
    readOpenClawConfig(),
    getCachedCatalog(),
    getSettings(),
  ]);

  return NextResponse.json({ config, catalog, activeModel: settings.activeModel });
}
