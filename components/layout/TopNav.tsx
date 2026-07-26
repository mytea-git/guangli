"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Workflow,
  FolderCode,
  Plug,
  Sparkles,
  Cpu,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "./ThemeToggle";
import { useSettingsStore, type ClientSettings } from "@/stores/settingsStore";

const NAV_ITEMS = [
  { href: "/workflow", label: "工作流", icon: Workflow, requiresConnect: false },
  { href: "/files", label: "代码管理", icon: FolderCode, requiresConnect: false },
  { href: "/soul", label: "Soul · 用量", icon: Sparkles, requiresConnect: false },
  { href: "/models", label: "模型", icon: Cpu, requiresConnect: false },
  { href: "/connect", label: "连接", icon: Plug, requiresConnect: true },
  { href: "/settings", label: "设置", icon: SettingsIcon, requiresConnect: false },
] as const;

export function TopNav({ initialSettings }: { initialSettings: ClientSettings }) {
  const pathname = usePathname();
  const storeSettings = useSettingsStore((s) => s.settings);
  const settings = storeSettings ?? initialSettings;

  useEffect(() => {
    if (!useSettingsStore.getState().settings) {
      useSettingsStore.getState().setSettings(initialSettings);
    }
    // 只在首次挂载时兜底填充一次，避免覆盖之后来自设置页的更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-1 px-3 sm:px-6">
        <span className="mr-4 shrink-0 text-lg font-semibold tracking-wide">光离</span>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.filter((item) => !item.requiresConnect || settings.connect.enabled).map(
            ({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  pathname.startsWith(href)
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
                )}
              >
                <Icon size={15} />
                {label}
              </Link>
            ),
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            title="退出登录"
            aria-label="退出登录"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
