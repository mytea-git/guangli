"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Brain, Search, Code2, CheckCircle2, Archive, ShieldAlert, Bot } from "lucide-react";
import { AGENT_STATUS_LABEL, type Agent } from "@/lib/providers/types";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Brain,
  Search,
  Code2,
  CheckCircle2,
  Archive,
  ShieldAlert,
};

const STATUS_STYLE: Record<Agent["status"], { dot: string; ring: string }> = {
  idle: { dot: "bg-neutral-400", ring: "border-neutral-200 dark:border-neutral-700" },
  thinking: { dot: "bg-blue-500", ring: "border-blue-400" },
  tool: { dot: "bg-amber-500", ring: "border-amber-400" },
  waiting: { dot: "bg-purple-500", ring: "border-purple-400" },
  error: { dot: "bg-red-500", ring: "border-red-500" },
};

export type AgentFlowNode = Node<{ agent: Agent }, "agent">;

function AgentNodeImpl({ data }: NodeProps<AgentFlowNode>) {
  const { agent } = data;
  const Icon = ICONS[agent.icon] ?? Bot;
  const style = STATUS_STYLE[agent.status];

  return (
    <div
      className={cn(
        "w-56 rounded-lg border-2 bg-white p-3 shadow-sm transition-colors duration-300 dark:bg-neutral-900",
        style.ring,
        agent.status === "error" && "animate-pulse",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-neutral-400" />
      <Handle type="source" position={Position.Right} className="!bg-neutral-400" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} className="shrink-0 text-neutral-500" />
          <span className="truncate text-sm font-medium">{agent.name}</span>
        </div>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} />
      </div>
      <p className="mt-2 line-clamp-2 min-h-[2.2em] text-xs text-neutral-500">
        {agent.currentTask ?? AGENT_STATUS_LABEL[agent.status]}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
        <span>{AGENT_STATUS_LABEL[agent.status]}</span>
        <span className="truncate rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{agent.model}</span>
      </div>
    </div>
  );
}

export const AgentNode = memo(AgentNodeImpl);
