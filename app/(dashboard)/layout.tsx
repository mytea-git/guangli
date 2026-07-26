import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { SettingsHydrator } from "@/components/layout/SettingsHydrator";
import { Toaster } from "@/components/ui/Toaster";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";
import { getSettings } from "@/lib/store/settings";
import { redactSettings } from "@/lib/store/settingsRedact";
import type { ClientSettings } from "@/stores/settingsStore";

// 必须强制动态渲染：getSettings() 读取的是运行时 /data/settings.json
// （挂载在 Docker volume 里，随时可能被设置页修改）。如果这里被
// Next 静态预渲染，读到的值会在 `next build` 时被"烤死"进静态 HTML，
// 之后设置页无论怎么改都不会反映到导航栏上。
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();
  const clientSettings = redactSettings(settings) as ClientSettings;

  return (
    <div className="flex min-h-screen flex-col">
      <SettingsHydrator initial={clientSettings} />
      <TopNav initialSettings={clientSettings} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
      <AssistantSidebar initialEnabled={clientSettings.assistant.enabled} />
      <Toaster />
    </div>
  );
}
