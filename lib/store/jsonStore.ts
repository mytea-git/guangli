import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSerialQueue } from "@/lib/utils/serialQueue";

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "./data");

function filePath(name: string): string {
  return path.join(DATA_DIR, name);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// 同一份文件的读写要串行化，避免并发写请求互相打断产生半截 JSON。
const enqueue = createSerialQueue("jsonStoreQueues");

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

// 下面两个 *Raw 函数是 readJson/writeJson 的核心逻辑，但不自带 enqueue——
// 这样 updateJson 才能把"读取当前值→计算下一个值→写回"合并进同一个
// enqueue 任务里，中间不会被其它并发的读/写请求插队。如果 readJson/
// writeJson 各自在内部 enqueue，updateJson 就没法把两步合并成一步原子
// 操作（对同一个 key 嵌套 enqueue 会互相等待造成死锁）。

async function readJsonRaw<T>(name: string, fallback: T): Promise<T> {
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
}

export interface WriteJsonOptions {
  /**
   * 写入前是否把磁盘上的旧内容快照一份（用于版本历史 + 灾难自动恢复）。
   * 高频写入且不算关键数据的文件（如 usage.json）不建议开启，避免
   * 版本记录被大量近乎重复的快照占满。
   */
  snapshot?: boolean;
  /**
   * 生成"写入前快照"内容时，先用这个函数处理原始 JSON 文本（例如把
   * 敏感字段替换成占位符）——只影响进入版本历史的副本，磁盘上实际
   * 写入的新内容不受影响。用于给 settings.json 里的 assistant.apiKey
   * 脱敏，避免明文密钥留在版本快照文件里。函数抛错时原样保留未脱敏的
   * 内容（宁可快照里带敏感字段，也不因脱敏失败丢失可恢复性）。
   */
  redactForSnapshot?: (raw: string) => string;
}

async function writeJsonRaw<T>(name: string, data: T, opts?: WriteJsonOptions): Promise<void> {
  await ensureDir();
  const target = filePath(name);

  if (opts?.snapshot) {
    try {
      let current = await fs.readFile(target, "utf8");
      if (opts.redactForSnapshot) {
        try {
          current = opts.redactForSnapshot(current);
        } catch {
          // 脱敏失败不阻止正常写入，仍用原始内容兜底
        }
      }
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

  const tmp = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, target);
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  return enqueue(name, () => readJsonRaw(name, fallback));
}

export async function writeJson<T>(name: string, data: T, opts?: WriteJsonOptions): Promise<void> {
  return enqueue(name, () => writeJsonRaw(name, data, opts));
}

/**
 * 读-改-写的原子版本：把"读取当前值→用 updater 计算下一个值→写回"合并
 * 进同一个入队任务，中间不会被其它并发的读/写请求插队。修复此前
 * "先 readJson 再单独 writeJson"两次分别入队、之间可能被别的并发写入
 * 插队导致丢更新的问题（典型场景：两个并发的 PUT /settings，或
 * settings PUT 与 mock/models-activate 等其它写 settings.json 的请求
 * 同时发生）。
 */
export async function updateJson<TRead, TWrite = TRead>(
  name: string,
  fallback: TRead,
  updater: (current: TRead) => TWrite,
  opts?: WriteJsonOptions,
): Promise<TWrite> {
  return enqueue(name, async () => {
    const current = await readJsonRaw<TRead>(name, fallback);
    const next = updater(current);
    await writeJsonRaw<TWrite>(name, next, opts);
    return next;
  });
}

/**
 * 写入一段已经是 JSON 文本的内容（而不是一个待 JSON.stringify 的对象），
 * 但仍然走与 readJson/writeJson 相同的按文件名串行化队列——供版本恢复
 * （lib/versions/store.ts 的 restoreVersion，kind==='data' 分支）使用，
 * 避免"从历史快照恢复某个 data 文件"这个操作绕开 jsonStore 的串行化，
 * 与同一个文件上正常进行的 readJson/writeJson 竞态。
 */
export async function writeJsonText(name: string, text: string): Promise<void> {
  return enqueue(name, async () => {
    await ensureDir();
    const target = filePath(name);
    const tmp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, text, "utf8");
    await fs.rename(tmp, target);
  });
}

export function dataDir(): string {
  return DATA_DIR;
}
