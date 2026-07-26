import type { ToolDefinition } from "../tools";
import type { StreamDelta } from "./openai";

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

/**
 * 解析 Anthropic Messages API 的流式响应。事件帧以空行分隔
 * （`event: xxx\ndata: {...}\n\n`），但每个 data payload 自带
 * `type` 字段与事件名一致，所以只需要解析 data 行本身，不必额外
 * 依赖 `event:` 行。工具调用的参数以 input_json_delta 分片到达，
 * 按 content block 的 index 累积。
 */
export async function streamAnthropicCompletion(
  apiKey: string,
  model: string,
  system: string,
  messages: AnthropicMessage[],
  tools: ToolDefinition[],
  onDelta: (delta: StreamDelta) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      stream: true,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`模型接口返回 ${res.status}：${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  interface AnthropicEvent {
    type: string;
    index?: number;
    content_block?: { type: string; id?: string; name?: string };
    delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
    error?: { message?: string };
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() ?? "";

    for (const block of eventBlocks) {
      const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;

      let json: AnthropicEvent;
      try {
        json = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue; // 跳过无法解析的单个事件，不中断整个流
      }

      if (json.type === "content_block_start" && json.content_block?.type === "tool_use") {
        onDelta({
          toolCallDeltas: [
            { index: json.index ?? 0, id: json.content_block.id, name: json.content_block.name, argumentsDelta: "" },
          ],
        });
      } else if (json.type === "content_block_delta") {
        if (json.delta?.type === "text_delta" && json.delta.text) {
          onDelta({ textDelta: json.delta.text });
        } else if (json.delta?.type === "input_json_delta" && json.delta.partial_json !== undefined) {
          onDelta({ toolCallDeltas: [{ index: json.index ?? 0, argumentsDelta: json.delta.partial_json }] });
        }
      } else if (json.type === "message_delta" && json.delta?.stop_reason) {
        onDelta({ finishReason: json.delta.stop_reason });
      } else if (json.type === "error") {
        throw new Error(json.error?.message || "Anthropic 流式响应出错");
      }
    }
  }
}
