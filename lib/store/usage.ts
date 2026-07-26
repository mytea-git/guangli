import { readJson, writeJson } from "./jsonStore";
import type { DailyUsage } from "@/lib/providers/types";
import { getGlobalSingleton } from "@/lib/utils/globalSingleton";

const FILE = "usage.json";
const FLUSH_DELAY_MS = 5000;

interface UsageState {
  byDate: Map<string, DailyUsage>;
  loaded: boolean;
  loadingPromise: Promise<void> | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

function state(): UsageState {
  return getGlobalSingleton("usageState", () => ({
    byDate: new Map<string, DailyUsage>(),
    loaded: false,
    loadingPromise: null,
    flushTimer: null,
  }));
}

function mergeBucket(target: DailyUsage, source: DailyUsage) {
  for (const [model, bucket] of Object.entries(source.models)) {
    const cur = target.models[model] ?? { inputTokens: 0, outputTokens: 0, calls: 0 };
    cur.inputTokens += bucket.inputTokens;
    cur.outputTokens += bucket.outputTokens;
    cur.calls += bucket.calls;
    target.models[model] = cur;
  }
}

async function ensureLoaded(): Promise<void> {
  const s = state();
  if (s.loaded) return;
  if (!s.loadingPromise) {
    s.loadingPromise = (async () => {
      const arr = await readJson<DailyUsage[]>(FILE, []);
      for (const day of arr) {
        // 引擎可能在磁盘加载完成前就已经为"今天"记了新的 tick——
        // 合并而不是覆盖，避免丢失这部分内存中的计数。
        const existing = s.byDate.get(day.date);
        if (existing) {
          mergeBucket(existing, day);
        } else {
          s.byDate.set(day.date, day);
        }
      }
      s.loaded = true;
    })();
  }
  await s.loadingPromise;
}

function scheduleFlush(): void {
  const s = state();
  if (s.flushTimer) return;
  s.flushTimer = setTimeout(() => {
    s.flushTimer = null;
    const arr = [...s.byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    void writeJson(FILE, arr);
  }, FLUSH_DELAY_MS);
}

function todayKey(timezone: string): string {
  // en-CA 的日期格式恰好是 YYYY-MM-DD。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function initUsage(): Promise<void> {
  await ensureLoaded();
}

/** 同步记录一次用量增量（引擎 tick 内调用），落盘走防抖异步刷新。 */
export function recordUsageTick(
  model: string,
  inputTokens: number,
  outputTokens: number,
  timezone = "Asia/Shanghai",
): string {
  const s = state();
  const date = todayKey(timezone);
  let bucket = s.byDate.get(date);
  if (!bucket) {
    bucket = { date, models: {} };
    s.byDate.set(date, bucket);
  }
  const m = bucket.models[model] ?? { inputTokens: 0, outputTokens: 0, calls: 0 };
  m.inputTokens += inputTokens;
  m.outputTokens += outputTokens;
  m.calls += 1;
  bucket.models[model] = m;
  scheduleFlush();
  return date;
}

export async function getUsageRange(from: string, to: string): Promise<DailyUsage[]> {
  await ensureLoaded();
  const s = state();
  return [...s.byDate.values()]
    .filter((d) => d.date >= from && d.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function resetUsage(): void {
  const s = state();
  s.byDate.clear();
  scheduleFlush();
}
