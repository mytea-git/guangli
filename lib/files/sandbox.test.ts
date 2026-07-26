import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveSafe, isValidFilename, PathViolation } from "./sandbox";

describe("resolveSafe", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "guangli-sandbox-"));
    fs.mkdirSync(path.join(root, "sub"));
    fs.writeFileSync(path.join(root, "sub", "a.txt"), "hello");
    fs.symlinkSync(os.tmpdir(), path.join(root, "escape-link"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("resolves a normal nested path within root", () => {
    const resolved = resolveSafe(root, "sub/a.txt");
    expect(resolved).toBe(fs.realpathSync(path.join(root, "sub", "a.txt")));
  });

  it("resolves the root itself", () => {
    const resolved = resolveSafe(root, "/");
    expect(resolved).toBe(fs.realpathSync(root));
  });

  // 注意：`../` 穿越不是通过"抛错拒绝"来处理的，而是被 posix normalize
  // 的锚定技巧就地吸收、安全地"钳制"到 root 内部（例如
  // "../etc/passwd" 被归一化为 "/etc/passwd"，最终解析成
  // `root/etc/passwd`，一个几乎必然不存在、读取会 404 的路径）。
  // 这里断言的是"结果必然落在 root 内"这条安全性质，而不是断言抛错。
  it("contains simple ../ traversal within root instead of escaping", () => {
    const resolved = resolveSafe(root, "../etc/passwd");
    expect(resolved.startsWith(fs.realpathSync(root) + path.sep)).toBe(true);
    expect(resolved).not.toContain(".." + path.sep);
  });

  it("contains ../ traversal that nets negative even after descending first", () => {
    const resolved = resolveSafe(root, "sub/../../etc/passwd");
    expect(resolved.startsWith(fs.realpathSync(root) + path.sep)).toBe(true);
  });

  it("contains an absolute-looking path escape within root", () => {
    const resolved = resolveSafe(root, "/etc/passwd");
    expect(resolved).toBe(path.join(fs.realpathSync(root), "etc", "passwd"));
  });

  it("blocks NUL byte", () => {
    expect(() => resolveSafe(root, "sub/a.txt\0.png")).toThrow(PathViolation);
  });

  it("blocks over-long paths", () => {
    expect(() => resolveSafe(root, "a".repeat(2000))).toThrow(PathViolation);
  });

  it("blocks symlink escape for an existing target", () => {
    expect(() => resolveSafe(root, "escape-link/whatever")).toThrow(PathViolation);
  });

  it("blocks symlink escape when creating a new file under a symlinked dir", () => {
    expect(() => resolveSafe(root, "escape-link/new-file.txt")).toThrow(PathViolation);
  });

  it("allows creating a new file under a not-yet-existing nested path", () => {
    const resolved = resolveSafe(root, "sub/new/nested.txt");
    expect(resolved.startsWith(fs.realpathSync(root))).toBe(true);
  });

  it("treats already-decoded literal percent-sequences as plain filename text, not a second decode", () => {
    // URL 解码发生在路由层（searchParams/JSON body 已解码一次）；这里收到的
    // 就是普通字符串。字面量 '%2e%2e' 只是一个奇怪但合法的文件名片段，
    // 不会被我们再次解码成 '..'，因此不应被拦截——真正的 '../' 穿越已经
    // 在上面的用例中被验证会被拦截。
    expect(() => resolveSafe(root, "sub/%2e%2e/name.txt")).not.toThrow();
  });
});

describe("isValidFilename", () => {
  it("accepts normal names", () => {
    expect(isValidFilename("hello.txt")).toBe(true);
    expect(isValidFilename("中文文件.md")).toBe(true);
  });

  it("rejects path separators, special characters, and dot-dirs", () => {
    expect(isValidFilename("a/b")).toBe(false);
    expect(isValidFilename("a\\b")).toBe(false);
    expect(isValidFilename("a:b")).toBe(false);
    expect(isValidFilename("..")).toBe(false);
    expect(isValidFilename(".")).toBe(false);
    expect(isValidFilename("")).toBe(false);
  });
});
