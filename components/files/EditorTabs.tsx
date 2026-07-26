"use client";

import { X, Circle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { OpenTab } from "@/stores/filesStore";

export function EditorTabs({
  tabs,
  activePath,
  onSelect,
  onClose,
}: {
  tabs: OpenTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50">
      {tabs.map((tab) => {
        const dirty = tab.content !== tab.originalContent;
        return (
          <div
            key={tab.path}
            onClick={() => onSelect(tab.path)}
            title={tab.path}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800",
              activePath === tab.path
                ? "bg-white dark:bg-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800",
            )}
          >
            <span className="max-w-[140px] truncate">{tab.name}</span>
            {dirty && <Circle size={6} className="shrink-0 fill-current text-blue-500" />}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
              title={dirty ? "关闭（有未保存的修改）" : "关闭"}
              className="shrink-0 rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
