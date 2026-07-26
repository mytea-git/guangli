import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "@/lib/store/jsonStore";
import { createSerialQueue } from "@/lib/utils/serialQueue";
import type { Conversation, ConversationSummary } from "./types";

const DIR_NAME = "assistant";
const MAX_CONVERSATIONS = 200;
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function assistantDir(): string {
  return path.join(dataDir(), DIR_NAME);
}

function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

// 每个会话文件各自的写入串行化，避免同一会话被并发请求写坏。
const enqueue = createSerialQueue("assistantQueues");

export function generateConversationId(): string {
  return randomUUID();
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const dir = assistantDir();
  await fs.mkdir(dir, { recursive: true });
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  const summaries: ConversationSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const conv = JSON.parse(raw) as Conversation;
      summaries.push({
        id: conv.id,
        title: conv.title,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length,
      });
    } catch {
      // 单个会话文件损坏时跳过，不影响其余会话的列出
    }
  }
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isValidId(id)) return null;
  try {
    const raw = await fs.readFile(path.join(assistantDir(), `${id}.json`), "utf8");
    return JSON.parse(raw) as Conversation;
  } catch {
    return null;
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  if (!isValidId(conv.id)) throw new Error("非法会话 ID");
  const dir = assistantDir();
  await enqueue(conv.id, async () => {
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, `${conv.id}.json`);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(conv, null, 2), "utf8");
    await fs.rename(tmp, target);
  });
}

export async function deleteConversation(id: string): Promise<void> {
  if (!isValidId(id)) throw new Error("非法会话 ID");
  await fs.rm(path.join(assistantDir(), `${id}.json`), { force: true });
}

/** 会话数超过上限时，清理最旧的一批，避免 data/assistant 无限增长。 */
export async function evictOldConversations(): Promise<void> {
  const summaries = await listConversations();
  if (summaries.length <= MAX_CONVERSATIONS) return;
  const toRemove = summaries.slice(MAX_CONVERSATIONS);
  await Promise.all(toRemove.map((s) => deleteConversation(s.id)));
}
