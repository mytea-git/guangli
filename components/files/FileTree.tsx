"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import type { FileTreeEntry } from "@/lib/files/service";
import { cn } from "@/lib/utils/cn";

interface FileTreeProps {
  entry: FileTreeEntry;
  activePath: string | null;
  onOpenFile: (entry: FileTreeEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileTreeEntry) => void;
  depth?: number;
}

export function FileTree({ entry, activePath, onOpenFile, onContextMenu, depth = 0 }: FileTreeProps) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (entry.type === "file") {
    return (
      <button
        type="button"
        onClick={() => onOpenFile(entry)}
        onContextMenu={(e) => onContextMenu(e, entry)}
        title={entry.path}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800",
          activePath === entry.path && "bg-neutral-100 dark:bg-neutral-800",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <File size={14} className="shrink-0 text-neutral-400" />
        <span className="truncate">{entry.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        onContextMenu={(e) => onContextMenu(e, entry)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {expanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
        {expanded ? (
          <FolderOpen size={14} className="shrink-0 text-amber-500" />
        ) : (
          <Folder size={14} className="shrink-0 text-amber-500" />
        )}
        <span className="truncate font-medium">{entry.name || "workspace"}</span>
      </button>
      {expanded && entry.children && (
        <div>
          {entry.children.length === 0 && (
            <p className="py-1 text-xs text-neutral-400" style={{ paddingLeft: 24 + depth * 14 }}>
              空文件夹
            </p>
          )}
          {entry.children.map((child) => (
            <FileTree
              key={child.path}
              entry={child}
              activePath={activePath}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
