"use client";

import { useMemo, useState } from "react";
import type { DailyUsage } from "@/lib/providers/types";
import { cn } from "@/lib/utils/cn";

type ViewMode = "month" | "week";

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

// Tailwind 的 JIT 扫描器需要在源码里"字面可见"完整的类名字符串才能生成
// 对应 CSS——不能用模板字符串拼接变量名（如 `bg-[var(--${x})]`），那样
// 扫描器抓不到，最终不会有任何颜色生效。所以这里用静态数组按 level 查表。
const LEVEL_CELL_CLASS = [
  "bg-[var(--heat-0)] border border-[var(--heat-0-border)]",
  "bg-[var(--heat-1)]",
  "bg-[var(--heat-2)]",
  "bg-[var(--heat-3)]",
  "bg-[var(--heat-4)]",
];
const LEVEL_LEGEND_CLASS = [
  "bg-[var(--heat-0)] border border-[var(--heat-0-border)]",
  "bg-[var(--heat-1)]",
  "bg-[var(--heat-2)]",
  "bg-[var(--heat-3)]",
  "bg-[var(--heat-4)]",
];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayTotal(day: DailyUsage | undefined): number {
  if (!day) return 0;
  return Object.values(day.models).reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0);
}

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

function computeLevel(value: number, quartiles: [number, number, number]): number {
  if (value <= 0) return 0;
  const [q1, q2, q3] = quartiles;
  if (value <= q1) return 1;
  if (value <= q2) return 2;
  if (value <= q3) return 3;
  return 4;
}

interface Cell {
  date: string;
  col: number;
  row: number;
  future: boolean;
  total: number;
  level: number;
  day: DailyUsage | undefined;
}

function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

interface UsageHeatmapProps {
  usage: DailyUsage[];
  loading: boolean;
}

export function UsageHeatmap({ usage, loading }: UsageHeatmapProps) {
  const [mode, setMode] = useState<ViewMode>("month");
  const [hovered, setHovered] = useState<Cell | null>(null);

  const byDate = useMemo(() => new Map(usage.map((d) => [d.date, d])), [usage]);

  const { cells, cols } = useMemo(() => {
    const today = new Date();
    const todayStr = toDateStr(today);

    let dateList: { date: string; col: number; row: number }[];
    let colCount: number;

    if (mode === "week") {
      colCount = 1;
      dateList = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - (6 - i));
        return { date: toDateStr(d), col: 0, row: i };
      });
    } else {
      colCount = 5;
      const endOfWeek = new Date(today);
      endOfWeek.setUTCDate(today.getUTCDate() + (6 - today.getUTCDay()));
      const start = new Date(endOfWeek);
      start.setUTCDate(endOfWeek.getUTCDate() - 34);
      dateList = Array.from({ length: 35 }, (_, i) => {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        return { date: toDateStr(d), col: Math.floor(i / 7), row: d.getUTCDay() };
      });
    }

    const totals = dateList.map(({ date }) => (date <= todayStr ? dayTotal(byDate.get(date)) : -1));
    const positive = totals.filter((t) => t > 0).sort((a, b) => a - b);
    const quartiles: [number, number, number] = [
      quantile(positive, 0.25),
      quantile(positive, 0.5),
      quantile(positive, 0.75),
    ];

    const built: Cell[] = dateList.map(({ date, col, row }, i) => {
      const future = date > todayStr;
      const total = future ? 0 : totals[i];
      return {
        date,
        col,
        row,
        future,
        total,
        level: future ? -1 : computeLevel(total, quartiles),
        day: byDate.get(date),
      };
    });
    return { cells: built, cols: colCount };
  }, [mode, byDate]);

  const totalTokens = cells.filter((c) => !c.future).reduce((sum, c) => sum + c.total, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Token 用量</h2>
        <div className="flex items-center rounded-md border border-neutral-200 p-0.5 text-xs dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setMode("month")}
            className={cn(
              "rounded px-2 py-1",
              mode === "month"
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500",
            )}
          >
            近一月
          </button>
          <button
            type="button"
            onClick={() => setMode("week")}
            className={cn(
              "rounded px-2 py-1",
              mode === "week"
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500",
            )}
          >
            近一周
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-neutral-400">加载中…</div>
      ) : (
        <div className="flex items-start gap-4">
          <div className="flex gap-3">
            <div className="flex flex-col justify-between py-[2px] text-[10px] text-neutral-400">
              {WEEKDAY_LABEL.map((label, i) => (
                <span key={i} className="h-[14px] leading-[14px]" style={{ visibility: i % 2 ? "visible" : "hidden" }}>
                  {label}
                </span>
              ))}
            </div>
            <div
              className="grid gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${cols}, 14px)`, gridTemplateRows: "repeat(7, 14px)" }}
            >
              {cells.map((cell) => (
                <div
                  key={cell.date}
                  onMouseEnter={() => !cell.future && setHovered(cell)}
                  onMouseLeave={() => setHovered((h) => (h?.date === cell.date ? null : h))}
                  onFocus={() => !cell.future && setHovered(cell)}
                  tabIndex={cell.future ? -1 : 0}
                  role={cell.future ? undefined : "button"}
                  aria-label={cell.future ? undefined : `${formatDateLabel(cell.date)}：${cell.total} tokens`}
                  className={cn(
                    "h-[14px] w-[14px] rounded-[3px] transition-transform",
                    cell.future
                      ? "invisible"
                      : cn(LEVEL_CELL_CLASS[cell.level], hovered?.date === cell.date && "scale-125"),
                  )}
                  style={{ gridColumn: cell.col + 1, gridRow: cell.row + 1 }}
                />
              ))}
            </div>
          </div>

          <div className="min-w-[180px] flex-1 text-xs">
            {hovered ? (
              <div>
                <p className="font-medium">{formatDateLabel(hovered.date)}</p>
                <p className="text-neutral-500">{hovered.total.toLocaleString()} tokens</p>
                {hovered.day && Object.keys(hovered.day.models).length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-neutral-400">
                    {Object.entries(hovered.day.models).map(([model, bucket]) => (
                      <li key={model}>
                        {model}：{(bucket.inputTokens + bucket.outputTokens).toLocaleString()}（输入{" "}
                        {bucket.inputTokens.toLocaleString()} / 输出 {bucket.outputTokens.toLocaleString()}）
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-neutral-400">无用量</p>
                )}
              </div>
            ) : (
              <div className="text-neutral-400">
                <p>
                  {mode === "month" ? "近一月" : "近一周"}共 {totalTokens.toLocaleString()} tokens
                </p>
                <p className="mt-1">将鼠标悬停在格子上查看当日详情</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
        <span>少</span>
        {LEVEL_LEGEND_CLASS.map((cls, i) => (
          <span key={i} className={cn("h-[10px] w-[10px] rounded-[2px]", cls)} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}
