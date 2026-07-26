"use client";

import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils/cn";

const OPTIONS = [
  { value: "light", icon: Sun, label: "浅色" },
  { value: "dark", icon: Moon, label: "深色" },
  { value: "system", icon: MonitorSmartphone, label: "跟随系统" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center rounded-md border border-neutral-200 p-0.5 dark:border-neutral-700">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => setTheme(value)}
          className={cn(
            "rounded p-1.5 transition-colors",
            theme === value
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800",
          )}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
