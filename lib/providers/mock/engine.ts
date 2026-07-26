import { getGlobalSingleton } from "@/lib/utils/globalSingleton";
import { recordUsageTick } from "@/lib/store/usage";
import { SEED_AGENTS, SEED_EDGES } from "./seed";
import type { Agent, AgentStatus, ProviderControls, ProviderEvent, WorkflowEdge } from "../types";

type Listener = (event: ProviderEvent) => void;

const TASK_PHRASES: Record<string, string[]> = {
  orchestrator: [
    "拆解用户请求…",
    "汇总子智能体结果…",
    "规划下一步任务…",
    "与值守员核对系统状态…",
  ],
  researcher: ["检索最新资料…", "整理搜索结果摘要…", "核实信息来源…"],
  coder: ["读取工作区文件…", "重构 files 模块…", "修复类型错误…", "运行本地校验…"],
  reviewer: ["审阅编码器的改动…", "检查测试覆盖…", "给出修改意见…"],
  "memory-keeper": ["归档今日对话要点…", "整理 MEMORY.md…", "清理过期记忆条目…"],
  watchdog: ["巡检各智能体心跳…", "核对最近一次快照…", "监控 token 用量异常…"],
};

const MODEL_WEIGHTS: Array<{ model: string; weight: number }> = [
  { model: "claude-sonnet-4-5", weight: 5 },
  { model: "claude-haiku-4-5", weight: 4 },
  { model: "gpt-5-mini", weight: 1 },
];

const BASE_TICK_MS = 1500;
const ERROR_RECOVERY_TICKS = 2;
const ERROR_ROLL_THRESHOLD = 0.03;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedModel(): string {
  const total = MODEL_WEIGHTS.reduce((sum, m) => sum + m.weight, 0);
  let roll = Math.random() * total;
  for (const m of MODEL_WEIGHTS) {
    roll -= m.weight;
    if (roll <= 0) return m.model;
  }
  return MODEL_WEIGHTS[0].model;
}

function nextStatus(prev: AgentStatus, roll: number): AgentStatus {
  if (roll < ERROR_ROLL_THRESHOLD) return "error";
  switch (prev) {
    case "idle":
      return roll < 0.33 ? "thinking" : "idle";
    case "thinking":
      return roll < 0.45 ? "tool" : roll < 0.6 ? "idle" : "thinking";
    case "tool":
      return roll < 0.4 ? "waiting" : roll < 0.7 ? "idle" : "tool";
    case "waiting":
      return roll < 0.6 ? "idle" : "waiting";
    case "error":
      return "error"; // 错误恢复走单独分支，不经过这里
  }
}

class MockEngine {
  private agents = new Map<string, Agent>(SEED_AGENTS.map((a) => [a.id, { ...a }]));
  private edges = new Map<string, WorkflowEdge>(SEED_EDGES.map((e) => [e.id, { ...e }]));
  private listeners = new Set<Listener>();
  private errorTicks = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private speed = 1;
  private paused = false;

  constructor() {
    this.start();
  }

  private start(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), BASE_TICK_MS / this.speed);
    this.timer.unref?.();
  }

  private emit(event: ProviderEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private edgesTouching(agentId: string): WorkflowEdge[] {
    return [...this.edges.values()].filter((e) => e.source === agentId || e.target === agentId);
  }

  private setEdgesActive(agentId: string, active: boolean): void {
    const changed: WorkflowEdge[] = [];
    for (const edge of this.edgesTouching(agentId)) {
      if (edge.active !== active) {
        edge.active = active;
        changed.push({ ...edge });
      }
    }
    if (changed.length) this.emit({ type: "edges:update", edges: changed });
  }

  private tick(): void {
    if (this.paused) return;
    const updatedAgents: Agent[] = [];

    for (const agent of this.agents.values()) {
      if (agent.status === "error") {
        const ticks = (this.errorTicks.get(agent.id) ?? 0) + 1;
        if (ticks >= ERROR_RECOVERY_TICKS) {
          agent.status = "idle";
          agent.currentTask = null;
          agent.lastActiveAt = new Date().toISOString();
          this.errorTicks.delete(agent.id);
          this.setEdgesActive(agent.id, false);
          updatedAgents.push({ ...agent });
        } else {
          this.errorTicks.set(agent.id, ticks);
        }
        continue;
      }

      const roll = Math.random();
      const next = nextStatus(agent.status, roll);
      if (next === agent.status) continue;

      agent.status = next;
      agent.lastActiveAt = new Date().toISOString();

      if (next === "error") {
        agent.currentTask = "发生错误，等待恢复…";
        this.errorTicks.set(agent.id, 0);
      } else if (next === "idle") {
        agent.currentTask = null;
      } else {
        agent.currentTask = pick(TASK_PHRASES[agent.id] ?? ["处理中…"]);
        agent.model = weightedModel();
      }

      const active = next === "thinking" || next === "tool";
      this.setEdgesActive(agent.id, active || next === "error");

      if (next === "thinking" || next === "tool") {
        const inputTokens = Math.floor(50 + Math.random() * 400);
        const outputTokens = Math.floor(30 + Math.random() * 500);
        const date = recordUsageTick(agent.model, inputTokens, outputTokens);
        this.emit({ type: "usage:tick", date, model: agent.model, delta: { inputTokens, outputTokens } });
      }

      updatedAgents.push({ ...agent });
    }

    if (updatedAgents.length) this.emit({ type: "agents:update", agents: updatedAgents });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): { agents: Agent[]; edges: WorkflowEdge[] } {
    return {
      agents: [...this.agents.values()].map((a) => ({ ...a })),
      edges: [...this.edges.values()].map((e) => ({ ...e })),
    };
  }

  getControls(): ProviderControls {
    return {
      pause: () => {
        this.paused = true;
      },
      resume: () => {
        this.paused = false;
      },
      reset: () => {
        this.agents = new Map(SEED_AGENTS.map((a) => [a.id, { ...a }]));
        this.edges = new Map(SEED_EDGES.map((e) => [e.id, { ...e }]));
        this.errorTicks.clear();
        this.emit({ type: "snapshot", ...this.getSnapshot() });
      },
      setSpeed: (speed: number) => {
        this.speed = speed;
        this.start();
      },
    };
  }
}

export function getMockEngine(): MockEngine {
  return getGlobalSingleton("mockEngine", () => new MockEngine());
}
