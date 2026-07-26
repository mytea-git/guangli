"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToastStore } from "@/stores/toastStore";
import { useTheme } from "@/hooks/useTheme";
import type { SoulFileInfo } from "@/lib/soul/scan";

const MonacoPane = dynamic(() => import("@/components/files/MonacoPane").then((m) => m.MonacoPane), {
  ssr: false,
  loading: () => <div className="flex h-64 items-center justify-center text-sm text-neutral-400">加载编辑器…</div>,
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function SoulCard({ file }: { file: SoulFileInfo }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [modifiedAt, setModifiedAt] = useState<string | null>(file.modifiedAt);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const pushToast = useToastStore((s) => s.push);
  const { resolvedDark } = useTheme();

  const dirty = content !== null && original !== null && content !== original;

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && content === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(file.path)}`);
        const data = await res.json().catch(() => ({}) as { error?: string; content?: string });
        if (!res.ok) {
          pushToast(data.error || "读取失败", "error");
          setExpanded(false);
          return;
        }
        setContent(data.content ?? "");
        setOriginal(data.content ?? "");
        setModifiedAt(data.modifiedAt ?? null);
      } catch {
        pushToast("网络错误", "error");
        setExpanded(false);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleSave() {
    if (content === null) return;
    setSaving(true);
    try {
      const res = await fetch("/api/files/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path, content, knownModifiedAt: modifiedAt ?? undefined }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string; modifiedAt?: string });
      if (res.status === 409) {
        pushToast("文件已被修改，请刷新后重试", "error");
        return;
      }
      if (!res.ok) {
        pushToast(data.error || "保存失败", "error");
        return;
      }
      setOriginal(content);
      setModifiedAt(data.modifiedAt ?? null);
      pushToast("已保存", "success");
    } catch {
      pushToast("网络错误，保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={handleExpand}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <FileText size={18} className="shrink-0 text-neutral-400" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{file.name}</span>
              {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
            </div>
            <p className="truncate text-xs text-neutral-400">{file.path}</p>
            {!expanded && file.preview && (
              <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{file.preview}…</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-neutral-400">
          <span>{formatSize(file.sizeBytes)}</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-800">
          {loading && <div className="flex h-64 items-center justify-center text-sm text-neutral-400">加载中…</div>}
          {!loading && content !== null && (
            <>
              <div className="h-64">
                <MonacoPane
                  path={file.path}
                  value={content}
                  onChange={setContent}
                  onSave={handleSave}
                  theme={resolvedDark ? "dark" : "light"}
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 p-2 dark:border-neutral-800">
                <span className="mr-auto text-xs text-neutral-400">{dirty ? "有未保存的修改" : "已保存"}</span>
                <Button variant="primary" onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? "保存中…" : "保存"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
