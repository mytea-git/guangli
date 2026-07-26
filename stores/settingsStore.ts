import { create } from "zustand";
import type { Settings } from "@/lib/store/settings";

// 服务端打码后的设置形态（assistant.apiKey 被替换为 hasApiKey 布尔值）。
// workspaceRoot 不再是 Settings 里的可写字段（见 lib/store/settings.ts
// 顶部注释），而是 API 路由额外附加的只读展示值，因此在这里单独声明。
export type ClientSettings = Omit<Settings, "assistant"> & {
  assistant: Omit<Settings["assistant"], "apiKey"> & { hasApiKey: boolean };
  workspaceRoot: string;
};

interface SettingsStore {
  settings: ClientSettings | null;
  setSettings: (settings: ClientSettings) => void;
}

// 定义在 'use client' 边界内，属于浏览器端每个标签页各自的单例，
// 不会跨请求 / 跨用户泄漏状态。用于让设置页的修改（如关闭连接区）
// 立即反映到顶部导航，而不必等待整页刷新。
export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}));
