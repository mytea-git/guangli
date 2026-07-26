import {
  listDirShallow,
  readFileContent,
  writeFileContent,
  FileNotFoundError,
  FileTooLargeError,
  BinaryFileError,
} from "@/lib/files/service";
import { PathViolation } from "@/lib/files/sandbox";
import { getProvider } from "@/lib/providers";
import { getSettings } from "@/lib/store/settings";
import { redactSettings } from "@/lib/store/settingsRedact";
import { AGENT_STATUS_LABEL } from "@/lib/providers/types";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<string>;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

// 未预期的文件系统错误（如 ENOENT/EACCES）的 message 里通常带着服务器
// 上的绝对路径——工具执行结果不只是显示给管理员看，还会被塞进发往
// 外部 LLM 提供方的请求里，所以这里比普通 API 的错误处理更保守：
// 已知/预期的错误类型才把描述性文案透出去，其余一律用固定文案，
// 详细原因只记录到服务端日志。
function safeToolError(err: unknown, context: string): string {
  console.error(`[assistant/tools] ${context}`, err);
  return "错误：操作失败";
}

export const ASSISTANT_TOOLS: ToolDefinition[] = [
  {
    name: "list_files",
    description: "列出工作区中某个目录下的文件与子目录（不递归）。path 留空表示工作区根目录。",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "工作区相对路径，留空表示根目录" } },
    },
    async execute(args) {
      try {
        const entries = await listDirShallow(asString(args.path));
        if (entries.length === 0) return "（空目录）";
        return entries.map((e) => `${e.type === "dir" ? "[目录]" : "[文件]"} ${e.path}`).join("\n");
      } catch (err) {
        if (err instanceof PathViolation) return "错误：非法路径";
        return safeToolError(err, "list_files");
      }
    },
  },
  {
    name: "read_file",
    description: "读取工作区中某个文件的文本内容（二进制或超过 1MB 的文件会被拒绝）。",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "工作区相对路径" } },
      required: ["path"],
    },
    async execute(args) {
      try {
        const result = await readFileContent(asString(args.path));
        return result.content;
      } catch (err) {
        if (err instanceof PathViolation) return "错误：非法路径";
        if (err instanceof FileNotFoundError) return "错误：文件不存在";
        if (err instanceof FileTooLargeError) return "错误：文件过大（超过 1MB）";
        if (err instanceof BinaryFileError) return "错误：二进制文件，无法读取";
        return safeToolError(err, "read_file");
      }
    },
  },
  {
    name: "write_file",
    description: "写入/覆盖工作区中某个文件的文本内容（会自动创建缺失的父目录，整体覆盖而不是追加）。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "工作区相对路径" },
        content: { type: "string", description: "新的完整文件内容" },
      },
      required: ["path", "content"],
    },
    async execute(args) {
      try {
        await writeFileContent(asString(args.path), asString(args.content));
        return "写入成功";
      } catch (err) {
        if (err instanceof PathViolation) return "错误：非法路径";
        if (err instanceof FileTooLargeError) return "错误：内容过大（超过 1MB）";
        return safeToolError(err, "write_file");
      }
    },
  },
  {
    name: "get_agents_status",
    description: "获取当前多智能体工作流中每个智能体的实时状态、当前任务与所用模型。",
    parameters: { type: "object", properties: {} },
    async execute() {
      const { agents } = await getProvider().getSnapshot();
      return agents
        .map(
          (a) =>
            `${a.name}（${a.id}）：${AGENT_STATUS_LABEL[a.status]}，模型 ${a.model}，任务：${a.currentTask ?? "无"}`,
        )
        .join("\n");
    },
  },
  {
    name: "get_settings",
    description: "获取当前系统设置（apiKey 等敏感字段会被打码，只显示是否已配置）。",
    parameters: { type: "object", properties: {} },
    async execute() {
      const settings = await getSettings();
      return JSON.stringify(redactSettings(settings), null, 2);
    },
  },
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}
