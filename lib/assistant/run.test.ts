import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Settings } from "@/lib/store/settings";
import type { ToolDefinition } from "./tools";

// 三个协作模块全部 mock 掉：
// - providers/openai、providers/anthropic 会发起真实网络请求（fetch），
//   测试里必须完全接管"流式响应"这一步，自己决定推送哪些 delta。
// - tools 的真实实现会连带加载 lib/files/service、lib/providers 等一整套
//   依赖；这里只关心 run.ts 如何驱动 getToolByName 返回的工具对象，
//   所以整体替换成受控的假实现。
vi.mock("./providers/openai", () => ({
  streamOpenAICompletion: vi.fn(),
}));
vi.mock("./providers/anthropic", () => ({
  streamAnthropicCompletion: vi.fn(),
}));
vi.mock("./tools", () => ({
  ASSISTANT_TOOLS: [],
  getToolByName: vi.fn(),
}));

const { runAssistant } = await import("./run");
const { streamOpenAICompletion } = await import("./providers/openai");
const { streamAnthropicCompletion } = await import("./providers/anthropic");
const { getToolByName } = await import("./tools");

function makeSettings(overrides: Partial<Settings["assistant"]> = {}): Settings["assistant"] {
  return {
    enabled: true,
    provider: "openai-compatible",
    baseUrl: "https://example.invalid",
    apiKey: "test-key",
    model: "test-model",
    maxToolRounds: 6,
    ...overrides,
  };
}

function makeEvents() {
  return { onText: vi.fn(), onToolCall: vi.fn(), onToolResult: vi.fn() };
}

function makeFakeTool(name = "get_agents_status"): ToolDefinition {
  return {
    name,
    description: "",
    parameters: { type: "object", properties: {} },
    execute: vi.fn(async () => "tool result text"),
  };
}

beforeEach(() => {
  // 每个用例重新设置 mock 实现，避免上一条用例遗留的 mockImplementation
  // 泄漏到下一条（尤其是"多轮循环"的用例会依赖调用次数计数）。
  vi.resetAllMocks();
});

describe("runAssistant — openai-compatible 路径", () => {
  it("模型只返回纯文本、没有工具调用：解析出一条新的 assistant 消息", async () => {
    vi.mocked(streamOpenAICompletion).mockImplementation(async (_baseUrl, _apiKey, _model, _messages, _tools, onDelta) => {
      onDelta({ textDelta: "hello" });
    });

    const events = makeEvents();
    const result = await runAssistant(makeSettings(), [], events);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toBe("hello");
    expect(events.onText).toHaveBeenCalledWith("hello");
  });

  it("单轮工具调用后接文本收尾：工具被执行一次，事件按顺序触发，返回消息顺序正确", async () => {
    const fakeTool = makeFakeTool();
    vi.mocked(getToolByName).mockReturnValue(fakeTool);

    let round = 0;
    vi.mocked(streamOpenAICompletion).mockImplementation(async (_baseUrl, _apiKey, _model, _messages, _tools, onDelta) => {
      round++;
      if (round === 1) {
        onDelta({
          toolCallDeltas: [{ index: 0, id: "call1", name: "get_agents_status", argumentsDelta: "{}" }],
        });
      } else {
        onDelta({ textDelta: "done" });
      }
    });

    const events = makeEvents();
    const result = await runAssistant(makeSettings(), [], events);

    expect(fakeTool.execute).toHaveBeenCalledTimes(1);
    expect(fakeTool.execute).toHaveBeenCalledWith({});
    expect(events.onToolCall).toHaveBeenCalledTimes(1);
    expect(events.onToolCall).toHaveBeenCalledWith("call1", "get_agents_status", {});
    expect(events.onToolResult).toHaveBeenCalledTimes(1);
    expect(events.onToolResult).toHaveBeenCalledWith("call1", "get_agents_status", "tool result text");

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe("assistant");
    expect(result[0].toolCalls).toEqual([{ id: "call1", name: "get_agents_status", arguments: {} }]);
    expect(result[1].role).toBe("tool");
    expect(result[1].content).toBe("tool result text");
    expect(result[1].toolCallId).toBe("call1");
    expect(result[2].role).toBe("assistant");
    expect(result[2].content).toBe("done");
  });

  it("达到 maxToolRounds 上限后停止循环，最后一条消息是固定的封顶提示", async () => {
    const fakeTool = makeFakeTool();
    vi.mocked(getToolByName).mockReturnValue(fakeTool);

    // 每一轮都返回工具调用、从不返回纯文本——如果没有上限保护，循环会
    // 无限跑下去。
    vi.mocked(streamOpenAICompletion).mockImplementation(async (_baseUrl, _apiKey, _model, _messages, _tools, onDelta) => {
      onDelta({
        toolCallDeltas: [{ index: 0, id: "call-loop", name: "get_agents_status", argumentsDelta: "{}" }],
      });
    });

    const events = makeEvents();
    const result = await runAssistant(makeSettings({ maxToolRounds: 2 }), [], events);

    expect(streamOpenAICompletion).toHaveBeenCalledTimes(2);
    expect(fakeTool.execute).toHaveBeenCalledTimes(2);

    const last = result[result.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.content).toContain("已达到");
    expect(last.content).toContain("工具调用轮数");
  });

  it("工具调用参数不是合法 JSON 时按 {} 兜底继续执行，而不是让整个流程抛出异常", async () => {
    const fakeTool = makeFakeTool();
    vi.mocked(getToolByName).mockReturnValue(fakeTool);

    let round = 0;
    vi.mocked(streamOpenAICompletion).mockImplementation(async (_baseUrl, _apiKey, _model, _messages, _tools, onDelta) => {
      round++;
      if (round === 1) {
        onDelta({
          toolCallDeltas: [{ index: 0, id: "call-bad", name: "get_agents_status", argumentsDelta: "{not valid" }],
        });
      } else {
        onDelta({ textDelta: "recovered" });
      }
    });

    const events = makeEvents();
    const result = await runAssistant(makeSettings(), [], events);

    expect(fakeTool.execute).toHaveBeenCalledTimes(1);
    expect(fakeTool.execute).toHaveBeenCalledWith({});
    expect(result.some((m) => m.role === "tool" && m.content === "tool result text")).toBe(true);
    expect(result[result.length - 1].content).toBe("recovered");
  });
});

describe("runAssistant — anthropic 路径（冒烟测试）", () => {
  it("provider = anthropic 时调用 streamAnthropicCompletion 而不是 streamOpenAICompletion", async () => {
    vi.mocked(streamAnthropicCompletion).mockImplementation(async (_apiKey, _model, _system, _messages, _tools, onDelta) => {
      onDelta({ textDelta: "anthropic-hello" });
    });

    const events = makeEvents();
    const result = await runAssistant(makeSettings({ provider: "anthropic" }), [], events);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toBe("anthropic-hello");
    expect(streamAnthropicCompletion).toHaveBeenCalledTimes(1);
    expect(streamOpenAICompletion).not.toHaveBeenCalled();
  });
});
