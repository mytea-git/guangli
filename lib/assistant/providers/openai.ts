import type { ToolDefinition } from "../tools";
import { ProviderApiError } from "./errors";

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface StreamDelta {
  textDelta?: string;
  toolCallDeltas?: Array<{ index: number; id?: string; name?: string; argumentsDelta?: string }>;
  finishReason?: string;
}

interface OpenAIStreamChoice {
  delta?: {
    content?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason?: string;
}

/**
 * 解析 OpenAI 兼容的 chat.completions 流式响应（SSE：`data: {...}\n\n`，
 * 以 `data: [DONE]` 结束）。每收到一个 delta 就通过 onDelta 回调交给
 * 上层——文本增量直接转发给客户端，工具调用增量则由调用方按 index 累积
 * （同一次工具调用的 name/arguments 经常分散在多个 chunk 里到达）。
 */
export async function streamOpenAICompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: OpenAIChatMessage[],
  tools: ToolDefinition[],
  onDelta: (delta: StreamDelta) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const body = {
    model,
    stream: true,
    messages,
    tools: tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ProviderApiError(`模型接口返回 ${res.status}：${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;

      let json: { choices?: OpenAIStreamChoice[] };
      try {
        json = JSON.parse(payload);
      } catch {
        continue; // 跳过无法解析的单个 chunk，不中断整个流
      }

      const choice = json.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      const out: StreamDelta = {};

      if (typeof delta.content === "string") out.textDelta = delta.content;
      if (Array.isArray(delta.tool_calls)) {
        out.toolCallDeltas = delta.tool_calls.map((tc) => ({
          index: tc.index ?? 0,
          id: tc.id,
          name: tc.function?.name,
          argumentsDelta: tc.function?.arguments,
        }));
      }
      if (choice.finish_reason) out.finishReason = choice.finish_reason;

      onDelta(out);
    }
  }
}
