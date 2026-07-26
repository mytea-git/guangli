import type { ReactNode } from "react";
import Link from "next/link";
import { TopNav } from "@/components/layout/TopNav";
import { SettingsHydrator } from "@/components/layout/SettingsHydrator";
import { Toaster } from "@/components/ui/Toaster";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";
import { getSettings } from "@/lib/store/settings";
import { redactSettings } from "@/lib/store/settingsRedact";
import { getWorkspaceRoot } from "@/lib/files/service";
import { getAuthRecord } from "@/lib/store/auth";
import type { ClientSettings } from "@/stores/settingsStore";

// 必须强制动态渲染：getSettings() 读取的是运行时 /data/settings.json
// （挂载在 Docker volume 里，随时可能被设置页修改）。如果这里被
// Next 静态预渲染，读到的值会在 `next build` 时被"烤死"进静态 HTML，
// 之后设置页无论怎么改都不会反映到导航栏上。
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [settings, workspaceRoot, authRecord] = await Promise.all([
    getSettings(),
    getWorkspaceRoot(),
    getAuthRecord(),
  ]);
  const clientSettings = { ...redactSettings(settings), workspaceRoot } as ClientSettings;

  return (
    <div className="flex min-h-screen flex-col">
      <SettingsHydrator initial={clientSettings} />
      {authRecord.bootstrapped && (
        <div className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 sm:px-6 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          当前仍在使用初始默认密码，任何知道默认值的人都能登录——请尽快前往{" "}
          <Link href="/settings" className="font-medium underline underline-offset-2">
            设置页
          </Link>{" "}
          修改管理员密码。
        </div>
      )}
      <TopNav initialSettings={clientSettings} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
      <AssistantSidebar initialEnabled={clientSettings.assistant.enabled} />
      <Toaster />
    </div>
  );
}
