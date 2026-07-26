import type { DataProvider } from "../types";
import { getMockEngine } from "./engine";
import { getUsageRange, initUsage } from "@/lib/store/usage";
import { getSettings } from "@/lib/store/settings";

export function createMockProvider(): DataProvider {
  const engine = getMockEngine();
  void initUsage();

  // 服务重启后，把上次持久化的运行状态重新应用到新的引擎实例——
  // 否则每次重启都会丢失这些选择（模型配置页选的模型又变回随机、
  // 设置页暂停的引擎又自己跑起来、调过的倍速被重置回 1x）。
  void getSettings().then((settings) => {
    const controls = engine.getControls();
    if (settings.activeModel) controls.setActiveModel(settings.activeModel);
    if (settings.mock.speed !== 1) controls.setSpeed(settings.mock.speed);
    if (settings.mock.paused) controls.pause();
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
