"use client";

import { useEffect, useState } from "react";
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
  Menu,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!useSettingsStore.getState().settings) {
      useSettingsStore.getState().setSettings(initialSettings);
    }
    // 只在首次挂载时兜底填充一次，避免覆盖之后来自设置页的更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 路由变化后自动收起移动端菜单，避免切换页面后菜单还悬在那里。
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.requiresConnect || settings.connect.enabled);

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-1 px-3 sm:px-6">
        <span className="mr-4 shrink-0 text-lg font-semibold tracking-wide">光离</span>

        {/* ≥640px：完整横向导航 */}
        <nav className="hidden flex-1 items-center gap-1 overflow-x-auto sm:flex">
          {visibleItems.map(({ href, label, icon: Icon }) => (
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
          ))}
        </nav>

        {/* <640px：占满剩余空间，把汉堡菜单按钮推到右侧 */}
        <div className="flex-1 sm:hidden" />

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
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            title="菜单"
            aria-label="菜单"
            aria-expanded={mobileOpen}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 sm:hidden"
          >
            {mobileOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      {/* <640px：展开式移动端菜单 */}
      {mobileOpen && (
        <nav className="flex flex-col gap-0.5 border-t border-neutral-200 p-2 sm:hidden dark:border-neutral-800">
          {visibleItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                pathname.startsWith(href)
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
