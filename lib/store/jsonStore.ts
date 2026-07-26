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

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  return enqueue(name, async () => {
    await ensureDir();
    try {
      const raw = await fs.readFile(filePath(name), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return fallback;
      // JSON 损坏或其它读取错误：记录日志并安全回退，避免整个应用崩溃。
      // 灾难自动恢复（M8）会在此基础上尝试从版本快照回滚。
      console.error(`[jsonStore] 读取 ${name} 失败，使用回退值`, err);
      return fallback;
    }
  });
}

export async function writeJson<T>(name: string, data: T): Promise<void> {
  await enqueue(name, async () => {
    await ensureDir();
    const target = filePath(name);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, target);
  });
}

export function dataDir(): string {
  return DATA_DIR;
}
