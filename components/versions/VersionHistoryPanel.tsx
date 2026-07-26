"use client";

import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils/cn";
import type { FileVersion } from "@/lib/versions/store";

interface VersionHistoryPanelProps {
  kind: "workspace" | "data";
  path: string;
  onClose: () => void;
  onRestored: () => void;
}

export function VersionHistoryPanel({ kind, path, onClose, onRestored }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    fetch(`/api/versions?kind=${kind}&path=${encodeURIComponent(path)}`)
      .then((res) => res.json())
      .then((data: { versions?: FileVersion[] }) => setVersions(data.versions ?? []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [kind, path]);

  async function handlePreview(id: string) {
    setPreviewId(id);
    setPreviewContent("加载中…");
    const res = await fetch(`/api/versions/content?kind=${kind}&path=${encodeURIComponent(path)}&versionId=${id}`);
    const data = await res.json().catch(() => ({}) as { content?: string });
    setPreviewContent(data.content ?? "（读取失败）");
  }

  async function handleRestore(id: string) {
    const ok = window.confirm("确定恢复到这个版本吗？当前内容会先被快照保存，之后仍可撤销。");
    if (!ok) return;
    const res = await fetch("/api/versions/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, path, versionId: id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string });
      pushToast(data.error || "恢复失败", "error");
      return;
    }
    pushToast("已恢复到历史版本", "success");
    onRestored();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <History size={15} className="shrink-0" />
            <span className="truncate">版本历史 · {path}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-40 shrink-0 overflow-y-auto border-r border-neutral-200 dark:border-neutral-800">
            {loading && <p className="p-3 text-xs text-neutral-400">加载中…</p>}
            {!loading && versions.length === 0 && <p className="p-3 text-xs text-neutral-400">暂无历史版本</p>}
            {versions.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() => handlePreview(v.id)}
                className={cn(
                  "block w-full border-b border-neutral-100 p-2 text-left text-xs hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800",
                  previewId === v.id && "bg-neutral-100 dark:bg-neutral-800",
                )}
              >
                <div>{new Date(v.savedAt).toLocaleString("zh-CN")}</div>
                <div className="text-neutral-400">
                  {(v.sizeBytes / 1024).toFixed(1)} KB{!v.knownGood && " · 校验失败"}
                </div>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all p-3 text-xs">
              {previewId ? previewContent : "点击左侧版本查看内容"}
            </pre>
            {previewId && (
              <div className="border-t border-neutral-200 p-2 dark:border-neutral-800">
                <Button variant="primary" onClick={() => handleRestore(previewId)} className="w-full">
                  <RotateCcw size={13} />
                  恢复到这个版本
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
