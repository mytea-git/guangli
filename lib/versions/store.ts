import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { dataDir, writeJsonText } from "@/lib/store/jsonStore";
import { resolveSafe } from "@/lib/files/sandbox";
import { getWorkspaceRoot } from "@/lib/files/service";
import { createSerialQueue } from "@/lib/utils/serialQueue";

export type VersionKind = "workspace" | "data";

export interface FileVersion {
  id: string;
  kind: VersionKind;
  relPath: string;
  savedAt: string;
  sizeBytes: number;
  /** JSON 类文件（kind==='data'）是否能被 JSON.parse 成功；workspace 文件恒为 true。 */
  knownGood: boolean;
  reason: "edit" | "auto" | "manual";
}

const MAX_VERSIONS_PER_FILE = 20;

// 同一个文件的版本历史（index.json + *.snapshot）读改写要串行化——
// 之前 snapshotFile 没有任何串行化保护，并发写同一个文件（比如 AI
// 助手写文件的同时用户手动保存）会互相踩踏 index.json（读-改-写不是
// 原子操作，后写的会覆盖先写的记录）和临时文件（原来用进程内常量
// `index.json.${pid}.tmp` 命名，同一 key 下并发写会撞同一个临时路径）。
const enqueue = createSerialQueue("versionsQueues");

function versionsRoot(): string {
  return path.join(dataDir(), "versions");
}

// 用 relPath 的 hash 而不是原始路径本身做目录名——原始路径可能带
// 斜杠/中文/超长文件名，直接当目录名用不安全也不便携。
function keyFor(kind: VersionKind, relPath: string): string {
  return createHash("sha1").update(`${kind}:${relPath}`).digest("hex").slice(0, 16);
}

function fileDir(kind: VersionKind, relPath: string): string {
  return path.join(versionsRoot(), keyFor(kind, relPath));
}

async function readIndex(dir: string): Promise<FileVersion[]> {
  try {
    const raw = await fs.readFile(path.join(dir, "index.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeIndex(dir: string, versions: FileVersion[]): Promise<void> {
  const target = path.join(dir, "index.json");
  const tmp = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(versions, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/**
 * 保存一份快照。调用方在"即将覆盖某个文件"之前，把磁盘上当前的内容
 * 传进来——这样任何一次写入都天然可回滚到"写入前"的状态。
 * 每个文件最多保留 20 个版本，超出的连同快照本体一起清理掉。
 */
export async function snapshotFile(
  kind: VersionKind,
  relPath: string,
  content: string,
  reason: FileVersion["reason"],
  knownGood = true,
): Promise<FileVersion> {
  const dir = fileDir(kind, relPath);
  return enqueue(dir, async () => {
    await fs.mkdir(dir, { recursive: true });
    const id = randomUUID();
    await fs.writeFile(path.join(dir, `${id}.snapshot`), content, "utf8");

    const version: FileVersion = {
      id,
      kind,
      relPath,
      savedAt: new Date().toISOString(),
      sizeBytes: Buffer.byteLength(content, "utf8"),
      knownGood,
      reason,
    };

    const versions = await readIndex(dir);
    versions.unshift(version);
    const overflow = versions.splice(MAX_VERSIONS_PER_FILE);
    await writeIndex(dir, versions);

    await Promise.all(overflow.map((v) => fs.rm(path.join(dir, `${v.id}.snapshot`), { force: true })));

    return version;
  });
}

export async function listVersions(kind: VersionKind, relPath: string): Promise<FileVersion[]> {
  return readIndex(fileDir(kind, relPath));
}

export async function getVersionContent(
  kind: VersionKind,
  relPath: string,
  versionId: string,
): Promise<string | null> {
  try {
    return await fs.readFile(path.join(fileDir(kind, relPath), `${versionId}.snapshot`), "utf8");
  } catch {
    return null;
  }
}

export async function getLatestKnownGood(
  kind: VersionKind,
  relPath: string,
): Promise<{ version: FileVersion; content: string } | null> {
  const versions = await listVersions(kind, relPath);
  const good = versions.find((v) => v.knownGood);
  if (!good) return null;
  const content = await getVersionContent(kind, relPath, good.id);
  if (content === null) return null;
  return { version: good, content };
}

/**
 * 把某个文件恢复到指定历史版本。恢复动作本身也是一次"写入"，同样会
 * 先把当前磁盘内容快照一份——回滚这个动作本身也是可撤销的。
 */
export async function restoreVersion(kind: VersionKind, relPath: string, versionId: string): Promise<void> {
  const content = await getVersionContent(kind, relPath, versionId);
  if (content === null) throw new Error("版本不存在");

  if (kind === "workspace") {
    const root = await getWorkspaceRoot();
    const abs = resolveSafe(root, relPath);
    try {
      const current = await fs.readFile(abs, "utf8");
      await snapshotFile("workspace", relPath, current, "auto");
    } catch {
      // 当前文件不存在（可能已被删除），没有内容可快照，直接恢复
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  } else {
    // data 类文件（settings.json / auth.json 等）恢复时，最终写入必须
    // 走 jsonStore 的 writeJsonText——它和 getSettings()/updateSettings()
    // 等日常读写共用同一把按文件名串行化的队列，避免"版本恢复"这个
    // 动作绕开队列、与并发的正常读写互相踩踏（此前这里是直接拿
    // fs.writeFile+rename 单独写，完全不经过 jsonStore 的保护）。
    // 注意：下面这一段"读取当前内容用于快照"仍是不加锁的裸读，理论上
    // 与一次几乎同时发生的 updateSettings() 写入之间还留有一个很窄的
    // 竞态窗口（快照可能不是"恢复前一刻"最新的内容）——但最终写入本身
    // 已经原子化，不会再出现恢复结果被后续正常写入静默覆盖/损坏的情况，
    // 只是快照准确性在这个极小概率场景下可能有一次误差，接受为已知的
    // 残余限制，而不是引入一次跨文件的复合事务来彻底消除它。
    const target = path.join(dataDir(), relPath);
    try {
      const current = await fs.readFile(target, "utf8");
      let knownGood = true;
      try {
        JSON.parse(current);
      } catch {
        knownGood = false;
      }
      await snapshotFile("data", relPath, current, "auto", knownGood);
    } catch {
      // 目标文件不存在，没有内容可快照
    }
    await writeJsonText(relPath, content);
  }
}

/**
 * "一键恢复"：把每一个有历史记录的文件都恢复到它自己的上一个版本
 * （即恢复到"最近一次写入之前"的状态——versions[0] 正是这个状态，
 * 因为每次写入都会把"写入前"的内容 unshift 到版本列表最前面）。
 * 只影响真正被追踪过（至少写过一次）的文件，从未修改过的文件不受影响。
 */
export async function restoreAllToPreviousVersion(): Promise<{ restored: string[]; failed: string[] }> {
  const root = versionsRoot();
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(root);
  } catch {
    return { restored: [], failed: [] };
  }

  const restored: string[] = [];
  const failed: string[] = [];

  for (const dirName of dirs) {
    const versions = await readIndex(path.join(root, dirName));
    if (versions.length === 0) continue;
    const latest = versions[0];
    try {
      await restoreVersion(latest.kind, latest.relPath, latest.id);
      restored.push(latest.relPath);
    } catch (err) {
      console.error(`[versions] 恢复 ${latest.relPath} 失败`, err);
      failed.push(latest.relPath);
    }
  }

  return { restored, failed };
}
