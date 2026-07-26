import type { DataProvider } from "../types";

/**
 * OpenClaw 网关适配器（占位 stub）。
 *
 * 预期实现方式：连接到 OpenClaw Gateway 的 WebSocket 控制 API
 * （默认 ws://<host>:18789），将网关推送的智能体状态变化 / 工具调用
 * 事件转换为本系统的 ProviderEvent（snapshot / agents:update /
 * edges:update / usage:tick）；用量统计从网关的 token 计费事件聚合。
 *
 * 尚未实现——当前仅用于让设置页可以展示"数据源：OpenClaw（未接入）"，
 * 并保证代码可编译、类型检查通过。
 */
export function createOpenClawProvider(opts: { url: string }): DataProvider {
  void opts;
  const notImplemented = (): never => {
    throw new Error("OpenClaw 网关适配器尚未实现");
  };
  return {
    mode: "openclaw",
    getSnapshot: async () => notImplemented(),
    subscribe: () => notImplemented(),
    getUsage: async () => notImplemented(),
    controls: () => null,
  };
}
