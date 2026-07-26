import type { Agent, WorkflowEdge } from "../types";

// 智能体分工与 workspace-demo/AGENTS.md 中的说明保持一致，
// 方便在 Files/Soul 页面对照阅读。
export const SEED_AGENTS: Agent[] = [
  {
    id: "orchestrator",
    name: "主脑",
    icon: "Brain",
    status: "idle",
    currentTask: null,
    model: "claude-sonnet-4-5",
    position: { x: 40, y: 180 },
    lastActiveAt: new Date(0).toISOString(),
  },
  {
    id: "researcher",
    name: "研究员",
    icon: "Search",
    status: "idle",
    currentTask: null,
    model: "claude-haiku-4-5",
    position: { x: 340, y: 20 },
    lastActiveAt: new Date(0).toISOString(),
  },
  {
    id: "coder",
    name: "编码器",
    icon: "Code2",
    status: "idle",
    currentTask: null,
    model: "claude-sonnet-4-5",
    position: { x: 340, y: 180 },
    lastActiveAt: new Date(0).toISOString(),
  },
  {
    id: "reviewer",
    name: "审阅员",
    icon: "CheckCircle2",
    status: "idle",
    currentTask: null,
    model: "claude-haiku-4-5",
    position: { x: 640, y: 180 },
    lastActiveAt: new Date(0).toISOString(),
  },
  {
    id: "memory-keeper",
    name: "记忆管家",
    icon: "Archive",
    status: "idle",
    currentTask: null,
    model: "claude-haiku-4-5",
    position: { x: 340, y: 340 },
    lastActiveAt: new Date(0).toISOString(),
  },
  {
    id: "watchdog",
    name: "值守员",
    icon: "ShieldAlert",
    status: "idle",
    currentTask: null,
    model: "claude-haiku-4-5",
    position: { x: -260, y: 180 },
    lastActiveAt: new Date(0).toISOString(),
  },
];

export const SEED_EDGES: WorkflowEdge[] = [
  { id: "e-watch-orch", source: "watchdog", target: "orchestrator", kind: "message", active: false },
  { id: "e-orch-res", source: "orchestrator", target: "researcher", kind: "delegation", active: false },
  { id: "e-orch-coder", source: "orchestrator", target: "coder", kind: "delegation", active: false },
  { id: "e-coder-rev", source: "coder", target: "reviewer", kind: "result", active: false },
  { id: "e-orch-mem", source: "orchestrator", target: "memory-keeper", kind: "message", active: false },
];
