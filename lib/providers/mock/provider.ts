import type { DataProvider } from "../types";
import { getMockEngine } from "./engine";
import { getUsageRange, initUsage } from "@/lib/store/usage";

export function createMockProvider(): DataProvider {
  const engine = getMockEngine();
  void initUsage();

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
