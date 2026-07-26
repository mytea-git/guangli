import { z } from "zod";
import { readJson, updateJson } from "./jsonStore";

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

// workspaceRoot 曾经是这里的一个可写字段（管理员可在设置页任意修改），
// 但 lib/files/service.ts 的 resolveSafe() 沙箱只保证"落在 root 内部"，
// 不保证 root 本身没被搬到别处——把 root 设成 "/" 就能让整个文件系统
// "落入沙箱"，文件 API 与 AI 助手的 read_file/write_file 工具因此获得
// 进程可达的任意路径读写权。现在固定只从 WORKSPACE_DIR 环境变量读取
// （与 DATA_DIR 的处理方式一致，见 lib/store/jsonStore.ts），部署期就
// 确定、运行时不可通过 API 改写；仍需要在 UI 展示当前值时，从
// lib/files/service.ts 的 getWorkspaceRoot() 读取，不再经过这份 schema。

function mergeWithDefaults(raw: Record<string, unknown>): Settings {
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    connect: { ...DEFAULT_SETTINGS.connect, ...(raw.connect as object) },
    mock: { ...DEFAULT_SETTINGS.mock, ...(raw.mock as object) },
    assistant: { ...DEFAULT_SETTINGS.assistant, ...(raw.assistant as object) },
  } as Settings;
  const parsed = SettingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  console.error("[settings] settings.json 校验失败，使用默认设置", parsed.error.flatten());
  return DEFAULT_SETTINGS;
}

export async function getSettings(): Promise<Settings> {
  const raw = await readJson<Record<string, unknown>>(FILE, {});
  return mergeWithDefaults(raw);
}

// 允许传入嵌套字段的部分更新（如 {connect: {enabled: true}}），
// 与当前设置做浅层按分组合并，而不是整体覆盖丢失同组内其它字段。
export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K];
};

// 快照进版本历史前，把 assistant.apiKey 替换成占位符——apiKey 本身仍会
// 明文写入当前的 settings.json（AI 助手运行时需要读到真实密钥），但
// "写入前"的旧版本快照只用于灾难恢复/历史查看，没有理由让每一次改密钥
// 都在磁盘上多留一份旧密钥的明文副本。
function redactApiKeyForSnapshot(raw: string): string {
  const obj = JSON.parse(raw) as { assistant?: { apiKey?: unknown } };
  if (obj && typeof obj === "object" && obj.assistant && typeof obj.assistant.apiKey === "string" && obj.assistant.apiKey) {
    obj.assistant.apiKey = "«redacted-by-guangli»";
  }
  return JSON.stringify(obj, null, 2);
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  return updateJson<Record<string, unknown>, Settings>(
    FILE,
    {},
    (raw) => {
      const current = mergeWithDefaults(raw);
      const next = {
        ...current,
        ...patch,
        connect: { ...current.connect, ...(patch.connect ?? {}) },
        mock: { ...current.mock, ...(patch.mock ?? {}) },
        assistant: { ...current.assistant, ...(patch.assistant ?? {}) },
      };
      return SettingsSchema.parse(next);
    },
    { snapshot: true, redactForSnapshot: redactApiKeyForSnapshot },
  );
}
