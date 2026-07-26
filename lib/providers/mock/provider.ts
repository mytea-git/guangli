import type { DataProvider } from "../types";
import { getMockEngine } from "./engine";
import { getUsageRange, initUsage } from "@/lib/store/usage";
import { getSettings } from "@/lib/store/settings";

export function createMockProvider(): DataProvider {
  const engine = getMockEngine();
  void initUsage();

  // 服务重启后，把上次在模型配置页选定的 activeModel 重新应用到引擎，
  // 否则每次重启都会丢失这个选择，主脑又变回随机模型。
  void getSettings().then((settings) => {
    if (settings.activeModel) {
      engine.getControls().setActiveModel(settings.activeModel);
    }
  });

  return {
    mode: "mock",
    async getSnapshot() {
      return engine.getSnapshot();
    },
    subscribe(listener) {
      return engine.subscribe(listener);
    },
    async getUsage(from, to) {
      return getUsageRange(from, to);
    },
    controls() {
      return engine.getControls();
    },
  };
}
