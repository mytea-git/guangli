// 数据模型与 DataProvider 适配层接口。
// MockProvider（lib/providers/mock）与未来的 OpenClawProvider
// （lib/providers/openclaw）都实现同一份 DataProvider 接口，
// 上层（页面、API 路由）只依赖这里的类型，不关心数据来自模拟引擎
// 还是真实的 OpenClaw 网关。

export type AgentStatus = "idle" | "thinking" | "tool" | "waiting" | "error";

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "空闲",
  thinking: "思考中",
  tool: "调用工具",
  waiting: "等待",
  error: "错误",
};

export interface Agent {
  id: string;
  name: string;
  icon: string;
  status: AgentStatus;
  currentTask: string | null;
  model: string;
  position: { x: number; y: number };
  lastActiveAt: string;
}

export type EdgeKind = "delegation" | "message" | "result";

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  active: boolean;
  label?: string;
}

export interface UsageModelBucket {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  models: Record<string, UsageModelBucket>;
}

export type ProviderEvent =
  | { type: "snapshot"; agents: Agent[]; edges: WorkflowEdge[] }
  | { type: "agents:update"; agents: Agent[] }
  | { type: "edges:update"; edges: WorkflowEdge[] }
  | {
      type: "usage:tick";
      date: string;
      model: string;
      delta: { inputTokens: number; outputTokens: number };
    };

export interface ProviderControls {
  pause(): void;
  resume(): void;
  reset(): void;
  setSpeed(speed: number): void;
}

export interface DataProvider {
  readonly mode: "mock" | "openclaw";
  getSnapshot(): Promise<{ agents: Agent[]; edges: WorkflowEdge[] }>;
  subscribe(listener: (event: ProviderEvent) => void): () => void;
  getUsage(from: string, to: string): Promise<DailyUsage[]>;
  /** 仅 mock provider 提供控制能力；真实网关适配器返回 null。 */
  controls(): ProviderControls | null;
}
