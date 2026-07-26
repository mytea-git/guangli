"use client";

import { useCallback, useState } from "react";
import { useEventStream } from "@/hooks/useEventStream";
import { AGENT_STATUS_LABEL, type Agent, type ProviderEvent, type WorkflowEdge } from "@/lib/providers/types";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";

const STATUS_DOT: Record<Agent["status"], string> = {
  idle: "bg-neutral-400",
  thinking: "bg-blue-500",
  tool: "bg-amber-500",
  waiting: "bg-purple-500",
  error: "bg-red-500",
};

export default function WorkflowPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [eventCount, setEventCount] = useState(0);

  const handleEvent = useCallback((event: ProviderEvent) => {
    setEventCount((c) => c + 1);
    if (event.type === "snapshot") {
      setAgents(event.agents);
      setEdges(event.edges);
    } else if (event.type === "agents:update") {
      setAgents((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]));
        for (const a of event.agents) map.set(a.id, a);
        return [...map.values()];
      });
    } else if (event.type === "edges:update") {
      setEdges((prev) => {
        const map = new Map(prev.map((e) => [e.id, e]));
        for (const e of event.edges) map.set(e.id, e);
        return [...map.values()];
      });
    }
  }, []);

  const { status } = useEventStream(handleEvent);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">多智能体工作流</h1>
        <span className="text-xs text-neutral-500">
          {status === "open" ? "● 已连接" : status === "reconnecting" ? "○ 重连中…" : "○ 连接中…"} · 已收到{" "}
          {eventCount} 条事件
        </span>
      </div>
      <p className="text-sm text-neutral-500">
        节点流程图（React Flow）将在下一阶段接入；当前展示后端实时状态数据，用于验证 SSE 通路。
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{agent.name}</span>
              <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[agent.status])} />
                {AGENT_STATUS_LABEL[agent.status]}
              </span>
            </div>
            <p className="mt-2 min-h-[1.5em] text-sm text-neutral-500">{agent.currentTask ?? "—"}</p>
            <p className="mt-1 text-xs text-neutral-400">{agent.model}</p>
          </Card>
        ))}
        {agents.length === 0 && <p className="text-sm text-neutral-400">等待快照数据…</p>}
      </div>
      <p className="text-xs text-neutral-400">
        当前边数：{edges.length}（活跃 {edges.filter((e) => e.active).length}）
      </p>
    </div>
  );
}
