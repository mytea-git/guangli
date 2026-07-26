import { randomUUID } from "node:crypto";
import { ASSISTANT_TOOLS, getToolByName } from "./tools";
import { streamOpenAICompletion, type OpenAIChatMessage } from "./providers/openai";
import { streamAnthropicCompletion, type AnthropicMessage, type AnthropicContentBlock } from "./providers/anthropic";
import type { Settings } from "@/lib/store/settings";
import type { ChatMessage, ToolCallRequest } from "./types";

const SYSTEM_PROMPT =
  "你是光离后台内置的 AI 助手，独立于 OpenClaw 本身运行，用来帮助用户快速排查和修复 OpenClaw 的配置/代码问题。" +
  "你可以调用工具读写工作区文件、查看多智能体状态、查看系统设置。修改文件前请先读取确认内容，" +
  "涉及删除或大范围覆盖等有风险的操作前，请先向用户说明并确认。回答使用简体中文，风格简洁直接。";

export interface RunEvents {
  onText: (delta: string) => void;
  onToolCall: (id: string, name: string, args: Record<string, unknown>) => void;
  onToolResult: (id: string, name: string, result: string) => void;
}

interface ToolCallAccum {
  id: string;
  name: string;
  argsText: string;
}

function accumulateToolCalls(
  deltas: Array<{ index: number; id?: string; name?: string; argumentsDelta?: string }>,
  store: Map<number, ToolCallAccum>,
) {
  for (const tc of deltas) {
    const existing = store.get(tc.index) ?? { id: "", name: "", argsText: "" };
    if (tc.id) existing.id = tc.id;
    if (tc.name) existing.name = tc.name;
    if (tc.argumentsDelta) existing.argsText += tc.argumentsDelta;
    store.set(tc.index, existing);
  }
}

function finalizeToolCalls(store: Map<number, ToolCallAccum>): ToolCallRequest[] {
  return [...store.values()].map((t) => {
    let args: Record<string, unknown> = {};
    try {
      args = t.argsText ? JSON.parse(t.argsText) : {};
    } catch {
      args = {};
    }
    return { id: t.id || randomUUID(), name: t.name, arguments: args };
  });
}

async function executeToolCalls(toolCalls: ToolCallRequest[], events: RunEvents): Promise<ChatMessage[]> {
  const results: ChatMessage[] = [];
  for (const tc of toolCalls) {
    events.onToolCall(tc.id, tc.name, tc.arguments);
    const tool = getToolByName(tc.name);
    const result = tool ? await tool.execute(tc.arguments) : `错误：未知工具 ${tc.name}`;
    events.onToolResult(tc.id, tc.name, result);
    results.push({
      id: randomUUID(),
      role: "tool",
      content: result,
      toolCallId: tc.id,
      toolName: tc.name,
      createdAt: new Date().toISOString(),
    });
  }
  return results;
}

function cappedMessage(): ChatMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    content: "（已达到单次对话最大工具调用轮数，若还需继续排查，请再发一条消息让我继续。）",
    createdAt: new Date().toISOString(),
  };
}

async function runOpenAICompatible(
  settings: Settings["assistant"],
  history: ChatMessage[],
  events: RunEvents,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const newMessages: ChatMessage[] = [];
  const oaMessages: OpenAIChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  for (const m of history) {
    if (m.role === "tool") {
      oaMessages.push({ role: "tool", content: m.content, tool_call_id: m.toolCallId });
    } else if (m.role === "assistant" && m.toolCalls?.length) {
      oaMessages.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });
    } else {
      oaMessages.push({ role: m.role, content: m.content });
    }
  }

  for (let round = 0; round < settings.maxToolRounds; round++) {
    let textAccum = "";
    const toolAccum = new Map<number, ToolCallAccum>();

    await streamOpenAICompletion(
      settings.baseUrl || "https://api.openai.com/v1",
      settings.apiKey,
      settings.model,
      oaMessages,
      ASSISTANT_TOOLS,
      (delta) => {
        if (delta.textDelta) {
          textAccum += delta.textDelta;
          events.onText(delta.textDelta);
        }
        if (delta.toolCallDeltas) accumulateToolCalls(delta.toolCallDeltas, toolAccum);
      },
      signal,
    );

    if (toolAccum.size > 0) {
      const toolCalls = finalizeToolCalls(toolAccum);
      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: textAccum,
        toolCalls,
        createdAt: new Date().toISOString(),
      };
      newMessages.push(assistantMsg);
      oaMessages.push({
        role: "assistant",
        content: textAccum || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      const toolResults = await executeToolCalls(toolCalls, events);
      newMessages.push(...toolResults);
      for (const tr of toolResults) {
        oaMessages.push({ role: "tool", content: tr.content, tool_call_id: tr.toolCallId });
      }
      continue;
    }

    newMessages.push({
      id: randomUUID(),
      role: "assistant",
      content: textAccum,
      createdAt: new Date().toISOString(),
    });
    return newMessages;
  }

  const capped = cappedMessage();
  events.onText(capped.content);
  newMessages.push(capped);
  return newMessages;
}

async function runAnthropic(
  settings: Settings["assistant"],
  history: ChatMessage[],
  events: RunEvents,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const newMessages: ChatMessage[] = [];
  const anMessages: AnthropicMessage[] = [];

  for (const m of history) {
    if (m.role === "tool") {
      // Anthropic 把工具结果表达成一条 user 消息里的 tool_result 内容块。
      anMessages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content }],
      });
    } else if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
      }
      anMessages.push({ role: "assistant", content: blocks });
    } else {
      anMessages.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
    }
  }

  for (let round = 0; round < settings.maxToolRounds; round++) {
    let textAccum = "";
    const toolAccum = new Map<number, ToolCallAccum>();

    await streamAnthropicCompletion(
      settings.apiKey,
      settings.model,
      SYSTEM_PROMPT,
      anMessages,
      ASSISTANT_TOOLS,
      (delta) => {
        if (delta.textDelta) {
          textAccum += delta.textDelta;
          events.onText(delta.textDelta);
        }
        if (delta.toolCallDeltas) accumulateToolCalls(delta.toolCallDeltas, toolAccum);
      },
      signal,
    );

    if (toolAccum.size > 0) {
      const toolCalls = finalizeToolCalls(toolAccum);
      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: textAccum,
        toolCalls,
        createdAt: new Date().toISOString(),
      };
      newMessages.push(assistantMsg);
      const blocks: AnthropicContentBlock[] = [];
      if (textAccum) blocks.push({ type: "text", text: textAccum });
      for (const tc of toolCalls) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
      anMessages.push({ role: "assistant", content: blocks });

      const toolResults = await executeToolCalls(toolCalls, events);
      newMessages.push(...toolResults);
      anMessages.push({
        role: "user",
        content: toolResults.map((tr) => ({
          type: "tool_result" as const,
          tool_use_id: tr.toolCallId ?? "",
          content: tr.content,
        })),
      });
      continue;
    }

    newMessages.push({
      id: randomUUID(),
      role: "assistant",
      content: textAccum,
      createdAt: new Date().toISOString(),
    });
    return newMessages;
  }

  const capped = cappedMessage();
  events.onText(capped.content);
  newMessages.push(capped);
  return newMessages;
}

export async function runAssistant(
  settings: Settings["assistant"],
  history: ChatMessage[],
  events: RunEvents,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  if (settings.provider === "anthropic") {
    return runAnthropic(settings, history, events, signal);
  }
  return runOpenAICompatible(settings, history, events, signal);
}
