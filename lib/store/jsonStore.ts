import fs from "node:fs/promises";
import path from "node:path";
import { getGlobalSingleton } from "@/lib/utils/globalSingleton";

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "./data");

function filePath(name: string): string {
  return path.join(DATA_DIR, name);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// 同一份文件的读写要串行化，避免并发写请求互相打断产生半截 JSON。
function queues(): Map<string, Promise<unknown>> {
  return getGlobalSingleton("jsonStoreQueues", () => new Map<string, Promise<unknown>>());
}

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const q = queues();
  const prev = q.get(key) ?? Promise.resolve();
  const next = prev.then(task, task);
  q.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

// 用动态 import 而不是静态 import lib/versions/store——那个模块反过来
// 又要从这里导入 dataDir()，静态双向 import 虽然在函数体内使用通常是
// 安全的，但 jsonStore 是几乎所有模块最早加载的基础设施，动态导入能
// 彻底避免任何模块初始化顺序上的意外。
async function tryAutoRecover(name: string): Promise<string | null> {
  try {
    const { getLatestKnownGood } = await import("@/lib/versions/store");
    const recovered = await getLatestKnownGood("data", name);
    return recovered?.content ?? null;
  } catch (err) {
    console.error(`[jsonStore] 尝试自动恢复 ${name} 时出错`, err);
    return null;
  }
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  return enqueue(name, async () => {
    await ensureDir();
    try {
      const raw = await fs.readFile(filePath(name), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return fallback;

      // JSON 损坏：这是灾难自动恢复要处理的场景——尝试从最近一个
      // "写入时能被 JSON.parse 成功"的历史快照自动回滚。
      console.error(`[jsonStore] 读取 ${name} 失败，尝试从版本快照自动恢复`, err);
      const recovered = await tryAutoRecover(name);
      if (recovered !== null) {
        try {
          const parsed = JSON.parse(recovered) as T;
          console.warn(`[jsonStore] 已从版本快照自动恢复 ${name}`);
          // 把恢复的内容写回磁盘，避免下次读取又要重新走一次恢复流程。
          await fs.writeFile(filePath(name), recovered, "utf8").catch(() => undefined);
          return parsed;
        } catch {
          // 快照本身也解析失败，继续走下面的回退值
        }
      }
      console.error(`[jsonStore] ${name} 自动恢复失败，使用回退值`);
      return fallback;
    }
  });
}

export interface WriteJsonOptions {
  /**
   * 写入前是否把磁盘上的旧内容快照一份（用于版本历史 + 灾难自动恢复）。
   * 高频写入且不算关键数据的文件（如 usage.json）不建议开启，避免
   * 版本记录被大量近乎重复的快照占满。
   */
  snapshot?: boolean;
}

export async function writeJson<T>(name: string, data: T, opts?: WriteJsonOptions): Promise<void> {
  await enqueue(name, async () => {
    await ensureDir();
    const target = filePath(name);

    if (opts?.snapshot) {
      try {
        const current = await fs.readFile(target, "utf8");
        let knownGood = true;
        try {
          JSON.parse(current);
        } catch {
          knownGood = false;
        }
        const { snapshotFile } = await import("@/lib/versions/store");
        await snapshotFile("data", name, current, "auto", knownGood);
      } catch {
        // 文件尚不存在（首次写入），没有旧内容可快照
      }
    }

    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, target);
  });
}

export function dataDir(): string {
  return DATA_DIR;
}
