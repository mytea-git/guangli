import fs from "node:fs";
import path from "node:path";

export class PathViolation extends Error {
  constructor() {
    super("非法路径");
    this.name = "PathViolation";
  }
}

const MAX_REL_LENGTH = 1024;

function nearestExistingAncestor(target: string): string {
  let dir = path.dirname(target);
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) break; // 到达文件系统根目录，避免死循环
    dir = parent;
  }
  return dir;
}

/**
 * 把客户端传入的工作区相对路径解析为磁盘绝对路径，并确保结果落在
 * root 内部——这是文件管理功能里风险最高的一段代码。防御点：
 * 1. NUL 字节 / 超长路径直接拒绝
 * 2. `../` 或绝对路径穿越：**不是**靠字符串匹配 `..` 来拒绝，而是先在
 *    rel 前面拼一个合成的 `/` 再做 posix normalize——normalize 会把
 *    多余的 `../` 在这个合成根前面就地吸收掉（无法越过它），于是
 *    "../etc/passwd" 被安全地"锚定"归一化为 "/etc/passwd"，最终解析
 *    成 root 内部的 `root/etc/passwd`（大概率不存在，读取会 404），
 *    而不是抛错——这是刻意的设计，不要误以为是遗漏了拒绝逻辑。
 *    下面的 startsWith 前缀检查因此在这条路径下恒为真，属于防御性的
 *    "第二道保险"，真正兜底的场景是 3 中的符号链接逃逸。
 * 3. 符号链接逃逸：对已存在的目标（或其最近的已存在父目录）再做一次
 *    realpath 校验，防止工作区内的符号链接指向区外
 *
 * 注意：这里不做任何 URL 解码——调用方（route handler）拿到的
 * searchParams / JSON body 已经是解码后的普通字符串，我们不会对它
 * 再次解码，因此不存在"二次解码"绕过的问题。
 */
export function resolveSafe(root: string, rel: string): string {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > MAX_REL_LENGTH || rel.includes("\0")) {
    throw new PathViolation();
  }

  const rootReal = fs.realpathSync(root);
  const normalizedRel = path.posix.normalize("/" + rel.split(path.sep).join("/"));
  const resolved = path.resolve(rootReal, "." + normalizedRel);

  if (resolved !== rootReal && !resolved.startsWith(rootReal + path.sep)) {
    throw new PathViolation();
  }

  const existing = fs.existsSync(resolved) ? resolved : nearestExistingAncestor(resolved);
  const existingReal = fs.realpathSync(existing);
  if (existingReal !== rootReal && !existingReal.startsWith(rootReal + path.sep)) {
    throw new PathViolation();
  }

  return resolved;
}

// 拒绝路径分隔符、常见非法字符，以及 '.' / '..' 这两个特殊目录名。
const FILENAME_RE = /^[^/\\:*?"<>|\x00]{1,255}$/;

export function isValidFilename(name: string): boolean {
  return name !== "." && name !== ".." && FILENAME_RE.test(name);
}
