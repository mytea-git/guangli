import type { Settings } from "./settings";

/** apiKey 只应停留在服务端；对客户端 / AI 助手工具输出一律打码，只暴露"是否已配置"。 */
export function redactSettings(settings: Settings) {
  const { assistant, ...rest } = settings;
  const { apiKey, ...assistantRest } = assistant;
  return {
    ...rest,
    assistant: { ...assistantRest, hasApiKey: Boolean(apiKey) },
  };
}
