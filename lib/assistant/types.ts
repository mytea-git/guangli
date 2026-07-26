export type ChatRole = "user" | "assistant" | "tool";

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** 纯文本内容；role==='tool' 时是工具执行结果的文本表示。 */
  content: string;
  /** role==='assistant' 且发起了工具调用时填充。 */
  toolCalls?: ToolCallRequest[];
  /** role==='tool' 时，对应是响应哪一次工具调用。 */
  toolCallId?: string;
  toolName?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}
