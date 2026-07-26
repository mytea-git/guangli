import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { checkRateLimit, clientIpFrom } from "@/lib/auth/rateLimit";
import { getSettings } from "@/lib/store/settings";
import { getConversation, saveConversation } from "@/lib/assistant/store";
import { runAssistant } from "@/lib/assistant/run";
import { ProviderApiError } from "@/lib/assistant/providers/errors";
import type { ChatMessage, Conversation } from "@/lib/assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1).max(20000),
});

function titleFromMessage(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  return trimmed.length > 30 ? trimmed.slice(0, 30) + "…" : trimmed || "新会话";
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  // 每次请求可能在工具调用循环里触发多次上游模型调用，限得比普通
  // API 更紧一些：每 IP 每分钟 20 次。
  const rl = checkRateLimit(`assistant-chat:${clientIpFrom(req)}`, { windowMs: 60_000, maxAttempts: 20 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "对话请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请求参数无效" }, { status: 400 });

  const settings = await getSettings();
  const { assistant } = settings;
  if (!assistant.enabled) {
    return NextResponse.json({ error: "AI 助手未启用，请在设置页开启" }, { status: 400 });
  }
  if (!assistant.apiKey || !assistant.model) {
    return NextResponse.json({ error: "AI 助手尚未配置模型 / API Key，请在设置页填写" }, { status: 400 });
  }
  if (assistant.provider === "openai-compatible" && !assistant.baseUrl) {
    return NextResponse.json({ error: "OpenAI 兼容模式需要填写 Base URL" }, { status: 400 });
  }

  let conv = await getConversation(parsed.data.conversationId);
  if (!conv) {
    const now = new Date().toISOString();
    conv = { id: parsed.data.conversationId, title: "新会话", messages: [], createdAt: now, updatedAt: now };
  }

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content: parsed.data.message,
    createdAt: new Date().toISOString(),
  };
  const historyForModel = [...conv.messages, userMsg];

  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // 客户端已断开，忽略后续写入
        }
      };

      req.signal.addEventListener("abort", () => abortController.abort());

      try {
        const newMessages = await runAssistant(
          assistant,
          historyForModel,
          {
            onText: (delta) => send("text", { delta }),
            onToolCall: (id, name, args) => send("tool_call", { id, name, arguments: args }),
            onToolResult: (id, name, result) => send("tool_result", { id, name, result }),
          },
          abortController.signal,
        );

        const updatedConv: Conversation = {
          ...conv,
          title: conv.messages.length === 0 ? titleFromMessage(parsed.data.message) : conv.title,
          messages: [...conv.messages, userMsg, ...newMessages],
          updatedAt: new Date().toISOString(),
        };
        await saveConversation(updatedConv);

        send("done", { conversationId: updatedConv.id, title: updatedConv.title });
      } catch (err) {
        console.error("[assistant/chat]", err);
        // 只把"上游模型 API 报错"这类已知安全的错误原样透出去（对方的
        // HTTP 状态码 + 响应摘要，帮助管理员排查自己的模型配置）；
        // 其它未预期错误一律用通用文案，避免服务器内部路径/堆栈泄露。
        const message = err instanceof ProviderApiError ? err.message : "助手响应出错，请查看服务端日志";
        send("error", { message });
        // 即使模型调用失败，也把用户这条消息落盘，避免用户输入丢失。
        const updatedConv: Conversation = {
          ...conv,
          messages: [...conv.messages, userMsg],
          updatedAt: new Date().toISOString(),
        };
        await saveConversation(updatedConv).catch(() => undefined);
      } finally {
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
