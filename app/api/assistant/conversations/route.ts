import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { listConversations, saveConversation, generateConversationId, evictOldConversations } from "@/lib/assistant/store";
import type { Conversation } from "@/lib/assistant/types";

export const runtime = "nodejs";

async function checkAuth(req: NextRequest) {
  try {
    await requireAuth(req);
    return null;
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;
  const conversations = await listConversations();
  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;

  const now = new Date().toISOString();
  const conv: Conversation = {
    id: generateConversationId(),
    title: "新会话",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveConversation(conv);
  await evictOldConversations();
  return NextResponse.json(conv);
}
