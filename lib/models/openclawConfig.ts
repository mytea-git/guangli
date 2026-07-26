import fs from "node:fs/promises";
import path from "node:path";
import { getWorkspaceRoot } from "@/lib/files/service";

export interface OpenClawModelConfig {
  provider: string;
  id: string;
  name?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface OpenClawAgentConfig {
  id: string;
  name: string;
  model: string;
}

export interface OpenClawConfig {
  gateway?: { host?: string; port?: number; webUrl?: string };
  model?: OpenClawModelConfig;
  agents?: OpenClawAgentConfig[];
}

// 兼容几种常见的 OpenClaw 配置文件放置位置。
const CONFIG_CANDIDATES = ["config/openclaw.json", "openclaw.json", ".openclaw/config.json"];

export async function readOpenClawConfig(): Promise<OpenClawConfig | null> {
  const root = await getWorkspaceRoot();
  for (const rel of CONFIG_CANDIDATES) {
    try {
      const raw = await fs.readFile(path.join(root, rel), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as OpenClawConfig;
    } catch {
      continue; // 文件不存在或解析失败，尝试下一个候选路径
    }
  }
  return null;
}
