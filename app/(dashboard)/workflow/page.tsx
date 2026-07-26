"use client";

import dynamic from "next/dynamic";

// React Flow 在渲染时会访问 window，必须禁用 SSR；
// next/dynamic 的 ssr:false 只能在客户端组件里使用，所以本页整体标 'use client'。
const WorkflowCanvas = dynamic(
  () => import("@/components/workflow/WorkflowCanvas").then((m) => m.WorkflowCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[60vh] items-center justify-center text-sm text-neutral-400">
        加载工作流画布…
      </div>
    ),
  },
);

export default function WorkflowPage() {
  return <WorkflowCanvas />;
}
