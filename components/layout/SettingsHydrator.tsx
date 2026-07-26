"use client";

import { useEffect } from "react";
import { useSettingsStore, type ClientSettings } from "@/stores/settingsStore";

/** 把服务端渲染时读到的初始设置灌入客户端 store，供 TopNav 等组件订阅。 */
export function SettingsHydrator({ initial }: { initial: ClientSettings }) {
  useEffect(() => {
    useSettingsStore.getState().setSettings(initial);
  }, [initial]);
  return null;
}
