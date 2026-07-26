"use client";

import type { DailyUsage } from "@/lib/providers/types";

interface ModelTotal {
  model: string;
  inputTokens: number;
  outputTokens: number;
  total: number;
}

export function ModelBreakdown({ usage }: { usage: DailyUsage[] }) {
  const totals = new Map<string, { inputTokens: number; outputTokens: number }>();
  for (const day of usage) {
    for (const [model, bucket] of Object.entries(day.models)) {
      const cur = totals.get(model) ?? { inputTokens: 0, outputTokens: 0 };
      cur.inputTokens += bucket.inputTokens;
      cur.outputTokens += bucket.outputTokens;
      totals.set(model, cur);
    }
  }
  const rows: ModelTotal[] = [...totals.entries()]
    .map(([model, t]) => ({ model, ...t, total: t.inputTokens + t.outputTokens }))
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">分模型用量（近 40 天）</h2>
      {rows.length === 0 && <p className="text-sm text-neutral-400">暂无用量数据</p>}
      {rows.map((row) => (
        <div key={row.model} className="flex items-center gap-3 text-xs">
          <span className="w-40 shrink-0 truncate text-neutral-500" title={row.model}>
            {row.model}
          </span>
          {/* 名义分类（模型名）不按数值上色——柱长本身就编码了量级，
              颜色统一用同一个色相，符合"nominal 不应该按值再上色"的规则 */}
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]"
              style={{ width: `${(row.total / max) * 100}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right tabular-nums text-neutral-400">
            {row.total.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
