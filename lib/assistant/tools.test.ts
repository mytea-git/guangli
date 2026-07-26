import { describe, it, expect, vi } from "vitest";

// 模拟一个"未预期"的文件系统错误——message 里带着服务器上的真实绝对
// 路径，就像 Node fs 抛出的 ENOENT/EACCES 错误那样。验证工具执行结果
// 不会把这段路径带出去（工具结果还会被发往外部 LLM API，比普通 API
// 错误响应的泄露面更敏感）。
const SECRET_PATH = "/home/admin/.ssh/id_rsa 或其它敏感服务器内部路径";

vi.mock("@/lib/files/service", () => ({
  listDirShallow: vi.fn(async () => {
    throw new Error(`ENOENT: no such file or directory, scandir '${SECRET_PATH}'`);
  }),
  readFileContent: vi.fn(async () => {
    throw new Error(`EACCES: permission denied, open '${SECRET_PATH}'`);
  }),
  writeFileContent: vi.fn(async () => {
    throw new Error(`ENOSPC: no space left on device, write '${SECRET_PATH}'`);
  }),
  FileNotFoundError: class FileNotFoundError extends Error {},
  FileTooLargeError: class FileTooLargeError extends Error {},
  BinaryFileError: class BinaryFileError extends Error {},
}));

vi.mock("@/lib/providers", () => ({
  getProvider: vi.fn(() => ({ getSnapshot: async () => ({ agents: [], edges: [] }) })),
}));

vi.mock("@/lib/store/settings", () => ({
  getSettings: vi.fn(async () => ({})),
}));

vi.mock("@/lib/store/settingsRedact", () => ({
  redactSettings: vi.fn((s) => s),
}));

const { ASSISTANT_TOOLS } = await import("./tools");

function getTool(name: string) {
  const tool = ASSISTANT_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`工具 ${name} 未找到`);
  return tool;
}

describe("assistant tools 不泄露未预期错误里的服务器路径", () => {
  it("list_files 的未预期错误返回通用文案，不含真实路径", async () => {
    const result = await getTool("list_files").execute({ path: "x" });
    expect(result).not.toContain(SECRET_PATH);
    expect(result).toBe("错误：操作失败");
  });

  it("read_file 的未预期错误返回通用文案，不含真实路径", async () => {
    const result = await getTool("read_file").execute({ path: "x" });
    expect(result).not.toContain(SECRET_PATH);
    expect(result).toBe("错误：操作失败");
  });

  it("write_file 的未预期错误返回通用文案，不含真实路径", async () => {
    const result = await getTool("write_file").execute({ path: "x", content: "y" });
    expect(result).not.toContain(SECRET_PATH);
    expect(result).toBe("错误：操作失败");
  });
});
