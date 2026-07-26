"use client";

import { useCallback, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, MarkerType, type Edge, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEventStream } from "@/hooks/useEventStream";
import type { Agent, ProviderEvent, WorkflowEdge } from "@/lib/providers/types";
import { AgentNode, type AgentFlowNode } from "./AgentNode";

const nodeTypes: NodeTypes = { agent: AgentNode };

const EDGE_KIND_COLOR: Record<WorkflowEdge["kind"], string> = {
  delegation: "#3b82f6",
  message: "#a855f7",
  result: "#10b981",
};

function toFlowNodes(agents: Agent[]): AgentFlowNode[] {
  return agents.map((agent) => ({
    id: agent.id,
    type: "agent",
    position: agent.position,
    data: { agent },
  }));
}

function toFlowEdges(edges: WorkflowEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: edge.active,
    label: edge.label,
    style: {
      stroke: EDGE_KIND_COLOR[edge.kind],
      strokeWidth: edge.active ? 2.5 : 1.5,
      opacity: edge.active ? 1 : 0.35,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_KIND_COLOR[edge.kind] },
  }));
}

export function WorkflowCanvas() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);

  const handleEvent = useCallback((event: ProviderEvent) => {
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

  const nodes = useMemo(() => toFlowNodes(agents), [agents]);
  const flowEdges = useMemo(() => toFlowEdges(edges), [edges]);

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-2">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">多智能体工作流</h1>
        <span className="text-xs text-neutral-500">
          {status === "open" ? "● 已连接" : status === "reconnecting" ? "○ 重连中…" : "○ 连接中…"}
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.4}
          maxZoom={1.5}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-neutral-100 dark:!bg-neutral-800" />
        </ReactFlow>
        {agents.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
            等待快照数据…
          </div>
        )}
      </div>
    </div>
  );
}
