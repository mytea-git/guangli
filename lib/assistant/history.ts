import type { ChatMessage } from "./types";

// 长会话如果每轮都把完整历史原样发给模型，上游 payload 和成本会随会话
// 长度无限增长。这里只限制"每轮实际发给模型看到的窗口"，完整历史仍然
// 全量落盘、UI 上也照常显示——不是删除数据，只是模型不再看得到太久
// 以前的轮次。
export const MAX_HISTORY_MESSAGES_FOR_MODEL = 40;

/**
 * 截取"发给模型看"的历史窗口。如果窗口开头恰好是孤立的 tool 消息
 * （对应的 assistant 工具调用被切在窗口之外），这类消息脱离上下文
 * 毫无意义，部分模型 API（如 Anthropic）还会因为 tool_result 前没有
 * 匹配的 tool_use 而直接报错——丢弃窗口开头这一段孤立的 tool 消息，
 * 而不是往前扩窗口（扩窗口会让"最多 N 条"这个上限失去意义）。
 */
export function windowHistoryForModel(
  messages: ChatMessage[],
  maxMessages: number = MAX_HISTORY_MESSAGES_FOR_MODEL,
): ChatMessage[] {
  const sliced = messages.slice(-maxMessages);
  let start = 0;
  while (start < sliced.length && sliced[start].role === "tool") start++;
  return sliced.slice(start);
}
