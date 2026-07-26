import type { DataProvider } from "./types";
import { createMockProvider } from "./mock/provider";
import { getGlobalSingleton } from "@/lib/utils/globalSingleton";

// 目前恒定使用 MockProvider；settings.providerMode 字段与
// OpenClawProvider stub 已经就位，等真实网关适配器实现后，
// 这里改为按设置动态选择即可，上层调用方（页面/API 路由）无需改动。
export function getProvider(): DataProvider {
  return getGlobalSingleton("dataProvider", () => createMockProvider());
}
