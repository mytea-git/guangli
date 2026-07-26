import { z } from "zod";
import { readJson, writeJson } from "./jsonStore";

const FILE = "settings.json";

// 允许为空（未配置/关闭）；一旦填写就必须是 http/https 地址——
// 防止意外把 javascript:/file: 等协议写进 iframe src 或出站请求目标。
const httpUrl = () =>
  z.string().refine((v) => v === "" || /^https?:\/\//i.test(v), { message: "必须是 http/https 开头的地址" });

export const SettingsSchema = z.object({
  connect: z.object({
    enabled: z.boolean(),
    url: httpUrl(),
  }),
  workspaceRoot: z.string(),
  theme: z.enum(["light", "dark", "system"]),
  timezone: z.string(),
  mock: z.object({
    speed: z.union([z.literal(0.5), z.literal(1), z.literal(2), z.literal(4)]),
    paused: z.boolean(),
  }),
  providerMode: z.enum(["mock", "openclaw"]),
  /** 模型配置页"快速切换"选中的模型 id；空字符串表示沿用工作区配置文件里的默认模型。 */
  activeModel: z.string(),
  assistant: z.object({
    enabled: z.boolean(),
    provider: z.enum(["anthropic", "openai-compatible"]),
    baseUrl: httpUrl(),
    apiKey: z.string(),
    model: z.string(),
    maxToolRounds: z.number().int().min(1).max(20),
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  connect: { enabled: false, url: "http://127.0.0.1:18789" },
  workspaceRoot: process.env.WORKSPACE_DIR || "./workspace-demo",
  theme: "system",
  timezone: "Asia/Shanghai",
  mock: { speed: 1, paused: false },
  providerMode: "mock",
  activeModel: "",
  assistant: {
    enabled: false,
    provider: "anthropic",
    baseUrl: "",
    apiKey: "",
    model: "",
    maxToolRounds: 6,
  },
};

export async function getSettings(): Promise<Settings> {
  const raw = await readJson<Record<string, unknown>>(FILE, {});
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    connect: { ...DEFAULT_SETTINGS.connect, ...(raw.connect as object) },
    mock: { ...DEFAULT_SETTINGS.mock, ...(raw.mock as object) },
    assistant: { ...DEFAULT_SETTINGS.assistant, ...(raw.assistant as object) },
  };
  const parsed = SettingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  console.error("[settings] settings.json 校验失败，使用默认设置", parsed.error.flatten());
  return DEFAULT_SETTINGS;
}

// 允许传入嵌套字段的部分更新（如 {connect: {enabled: true}}），
// 与当前设置做浅层按分组合并，而不是整体覆盖丢失同组内其它字段。
export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K];
};

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    connect: { ...current.connect, ...(patch.connect ?? {}) },
    mock: { ...current.mock, ...(patch.mock ?? {}) },
    assistant: { ...current.assistant, ...(patch.assistant ?? {}) },
  };
  const parsed = SettingsSchema.parse(next);
  await writeJson(FILE, parsed, { snapshot: true });
  return parsed;
}
