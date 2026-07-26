import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafe, isValidFilename, PathViolation } from "./sandbox";
import { getSettings } from "@/lib/store/settings";

export interface FileTreeEntry {
  name: string;
  path: string; // workspace 相对路径，posix 风格
  type: "file" | "dir";
  sizeBytes?: number;
  children?: FileTreeEntry[];
}

const IGNORED_NAMES = new Set(["node_modules", ".DS_Store"]);
const MAX_DEPTH = 12;
const MAX_ENTRIES = 2000;
export const MAX_FILE_BYTES = 1024 * 1024; // 1MB

const BINARY_EXT_DENYLIST = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".zip", ".gz", ".tar",
  ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".mp3", ".mp4", ".mov", ".exe", ".dll", ".so",
]);

export async function getWorkspaceRoot(): Promise<string> {
  const settings = await getSettings();
  return path.resolve(process.cwd(), settings.workspaceRoot);
}

export interface ShallowEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sizeBytes?: number;
}

/** 非递归地列出一层目录内容——AI 助手的 list_files 工具用这个，不需要整棵树。 */
export async function listDirShallow(relPath: string): Promise<ShallowEntry[]> {
  const root = await getWorkspaceRoot();
  const abs = resolveSafe(root, relPath || "/");
  const dirents = await fs.readdir(abs, { withFileTypes: true });
  const entries: ShallowEntry[] = [];
  for (const dirent of dirents) {
    if (IGNORED_NAMES.has(dirent.name) || dirent.name.startsWith(".git")) continue;
    const entryAbs = path.join(abs, dirent.name);
    const entryRel = relPath ? `${relPath}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      entries.push({ name: dirent.name, path: entryRel, type: "dir" });
    } else if (dirent.isFile()) {
      const stat = await fs.stat(entryAbs);
      entries.push({ name: dirent.name, path: entryRel, type: "file", sizeBytes: stat.size });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFileTree(): Promise<FileTreeEntry> {
  const root = await getWorkspaceRoot();
  await fs.mkdir(root, { recursive: true });
  let count = 0;

  async function walk(dir: string, rel: string, depth: number): Promise<FileTreeEntry[]> {
    if (depth > MAX_DEPTH) return [];
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const entries: FileTreeEntry[] = [];
    const sorted = [...dirents].sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of sorted) {
      if (count >= MAX_ENTRIES) break;
      if (IGNORED_NAMES.has(dirent.name) || dirent.name.startsWith(".git")) continue;
      count += 1;
      const entryRel = rel ? `${rel}/${dirent.name}` : dirent.name;
      const entryAbs = path.join(dir, dirent.name);

      if (dirent.isDirectory()) {
        entries.push({
          name: dirent.name,
          path: entryRel,
          type: "dir",
          children: await walk(entryAbs, entryRel, depth + 1),
        });
      } else if (dirent.isFile()) {
        const stat = await fs.stat(entryAbs);
        entries.push({ name: dirent.name, path: entryRel, type: "file", sizeBytes: stat.size });
      }
    }
    return entries;
  }

  const children = await walk(root, "", 0);
  return { name: "workspace", path: "", type: "dir", children };
}

function isLikelyBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
}

export class FileTooLargeError extends Error {}
export class BinaryFileError extends Error {}
export class FileNotFoundError extends Error {}
export class ConflictError extends Error {}

export interface FileContentResult {
  content: string;
  sizeBytes: number;
  modifiedAt: string;
}

export async function readFileContent(relPath: string): Promise<FileContentResult> {
  const root = await getWorkspaceRoot();
  const abs = resolveSafe(root, relPath);

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    throw new FileNotFoundError();
  }
  if (!stat.isFile()) throw new FileNotFoundError();
  if (stat.size > MAX_FILE_BYTES) throw new FileTooLargeError();

  const ext = path.extname(abs).toLowerCase();
  const buf = await fs.readFile(abs);
  if (BINARY_EXT_DENYLIST.has(ext) || isLikelyBinary(buf)) {
    throw new BinaryFileError();
  }

  return {
    content: buf.toString("utf8"),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

export async function writeFileContent(
  relPath: string,
  content: string,
  knownModifiedAt?: string,
): Promise<{ modifiedAt: string }> {
  const root = await getWorkspaceRoot();
  const abs = resolveSafe(root, relPath);

  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw new FileTooLargeError();
  }

  if (knownModifiedAt) {
    try {
      const stat = await fs.stat(abs);
      if (stat.mtime.toISOString() !== knownModifiedAt) {
        throw new ConflictError();
      }
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw err;
      // 文件尚不存在，视为新建，跳过冲突检查
    }
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  const stat = await fs.stat(abs);
  return { modifiedAt: stat.mtime.toISOString() };
}

export async function createEntry(relPath: string, kind: "file" | "dir"): Promise<void> {
  const root = await getWorkspaceRoot();
  const abs = resolveSafe(root, relPath);
  const name = path.basename(abs);
  if (!isValidFilename(name)) throw new PathViolation();

  if (kind === "dir") {
    await fs.mkdir(abs, { recursive: false });
  } else {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const handle = await fs.open(abs, "wx"); // 'wx'：已存在则失败，不覆盖
    await handle.close();
  }
}

export async function deleteEntry(relPath: string, recursive: boolean): Promise<void> {
  const root = await getWorkspaceRoot();
  const abs = resolveSafe(root, relPath);
  if (abs === root) throw new PathViolation(); // 禁止删除工作区根目录本身
  await fs.rm(abs, { recursive, force: false });
}

export async function renameEntry(fromRel: string, toRel: string): Promise<void> {
  const root = await getWorkspaceRoot();
  const fromAbs = resolveSafe(root, fromRel);
  const toAbs = resolveSafe(root, toRel); // 新旧路径都要过沙箱校验
  const name = path.basename(toAbs);
  if (!isValidFilename(name)) throw new PathViolation();
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.rename(fromAbs, toAbs);
}
