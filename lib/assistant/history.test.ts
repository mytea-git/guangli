import { describe, it, expect } from "vitest";
import { windowHistoryForModel } from "./history";
import type { ChatMessage } from "./types";

// 构造最小化的假消息——这些用例只关心 role/content，其余字段随便填
// 一个满足类型的占位值即可。
function makeMessage(index: number, role: ChatMessage["role"] = "user", content?: string): ChatMessage {
  return {
    id: String(index),
    role,
    content: content ?? `msg-${index}`,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

describe("windowHistoryForModel", () => {
  it("消息数少于 maxMessages 时原样返回，不做任何截断", () => {
    const messages = Array.from({ length: 10 }, (_, i) => makeMessage(i));
    const result = windowHistoryForModel(messages, 40);
    expect(result).toHaveLength(10);
    expect(result).toEqual(messages);
  });

  it("消息数超过 maxMessages 时只保留最后 N 条", () => {
    const messages = Array.from({ length: 50 }, (_, i) => makeMessage(i));
    const result = windowHistoryForModel(messages, 40);
    expect(result).toHaveLength(40);
    // 第 50 条（index 49）往前数 40 条，应该从 index 10（"msg-10"）开始。
    expect(result[0].content).toBe("msg-10");
    expect(result[result.length - 1].content).toBe("msg-49");
  });

  it("窗口开头恰好切在孤立的 tool 消息上时，丢弃这段开头的 tool 消息", () => {
    // 20 条填充用户消息 + 1 条发起工具调用的 assistant 消息 + 2 条对应的
    // tool 结果消息 + 15 条之后的正常消息，总共 38 条。
    const filler = Array.from({ length: 20 }, (_, i) => makeMessage(i, "user", `filler-${i}`));
    const assistantCall = makeMessage(20, "assistant", "assistant-calls-tool");
    const toolResults = [makeMessage(21, "tool", "tool-result-0"), makeMessage(22, "tool", "tool-result-1")];
    const after = Array.from({ length: 15 }, (_, i) => makeMessage(23 + i, "user", `after-${i}`));
    const messages = [...filler, assistantCall, ...toolResults, ...after];
    expect(messages).toHaveLength(38);

    // maxMessages 取"从第一条 tool 消息到末尾"的条数（2 条 tool + 15 条
    // 之后的消息 = 17），这样 slice(-17) 恰好把发起调用的 assistant
    // 消息切在窗口之外，窗口开头正好落在孤立的 tool 消息上。
    const result = windowHistoryForModel(messages, 17);

    expect(result[0].role).not.toBe("tool");
    expect(result).toHaveLength(15);
    expect(result[0].content).toBe("after-0");
    expect(result[result.length - 1].content).toBe("after-14");
  });

  it("窗口开头有连续多条 tool 消息（模拟一轮里有多次工具调用）时，全部丢弃而不是只丢第一条", () => {
    const messages: ChatMessage[] = [
      makeMessage(0, "tool", "tool-0"),
      makeMessage(1, "tool", "tool-1"),
      makeMessage(2, "tool", "tool-2"),
      makeMessage(3, "user", "user-3"),
      makeMessage(4, "assistant", "assistant-4"),
    ];
    // maxMessages 大于消息总数，slice(-maxMessages) 不产生额外截断，
    // 只验证"丢弃开头 tool 消息"这一步本身的行为。
    const result = windowHistoryForModel(messages, 10);
    expect(result).toHaveLength(2);
    expect(result.some((m) => m.role === "tool")).toBe(false);
    expect(result[0].content).toBe("user-3");
    expect(result[1].content).toBe("assistant-4");
  });

  it("省略第二个参数时使用默认值 40", () => {
    const messages = Array.from({ length: 41 }, (_, i) => makeMessage(i));
    const result = windowHistoryForModel(messages);
    expect(result).toHaveLength(40);
    // 只丢弃最旧的一条（index 0），其余顺序不变。
    expect(result[0].content).toBe("msg-1");
    expect(result[result.length - 1].content).toBe("msg-40");
  });

  it("空数组输入得到空数组输出", () => {
    expect(windowHistoryForModel([])).toEqual([]);
  });
});
