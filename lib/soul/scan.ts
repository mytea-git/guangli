import fs from "node:fs/promises";
import path from "node:path";
import { getWorkspaceRoot } from "@/lib/files/service";

export interface SoulFileInfo {
  path: string; // 工作区相对路径
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  preview: string;
}

// 匹配 OpenClaw 风格的人格/记忆文件：固定名或 *.soul.md 后缀
const SOUL_NAME_RE = /^(SOUL|AGENTS|IDENTITY|USER|TOOLS|MEMORY)\.md$/i;
const SOUL_SUFFIX_RE = /\.soul\.md$/i;
const MAX_DEPTH = 3;
const PREVIEW_LEN = 200;

function isSoulFile(name: string): boolean {
  return SOUL_NAME_RE.test(name) || SOUL_SUFFIX_RE.test(name);
}

export async function scanSoulFiles(): Promise<SoulFileInfo[]> {
  const root = await getWorkspaceRoot();
  const results: SoulFileInfo[] = [];

  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // 目录不存在/不可读，跳过而不是整体报错
    }
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".") || dirent.name === "node_modules") continue;
      const entryRel = rel ? `${rel}/${dirent.name}` : dirent.name;
      const entryAbs = path.join(dir, dirent.name);

      if (dirent.isDirectory()) {
        await walk(entryAbs, entryRel, depth + 1);
      } else if (dirent.isFile() && isSoulFile(dirent.name)) {
        try {
          const stat = await fs.stat(entryAbs);
          const buf = await fs.readFile(entryAbs);
          const isBinary = buf.subarray(0, 8192).includes(0);
          const preview = isBinary ? "" : buf.toString("utf8").slice(0, PREVIEW_LEN);
          results.push({
            path: entryRel,
            name: dirent.name,
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            preview,
          });
        } catch {
          // 单个文件读取失败不影响整体扫描结果
        }
      }
    }
  }

  await walk(root, "", 0);
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}
