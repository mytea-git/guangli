"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SoulCard } from "@/components/soul/SoulCard";
import { UsageHeatmap } from "@/components/soul/UsageHeatmap";
import { ModelBreakdown } from "@/components/soul/ModelBreakdown";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { SoulFileInfo } from "@/lib/soul/scan";
import type { DailyUsage } from "@/lib/providers/types";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function SoulPage() {
  const [files, setFiles] = useState<SoulFileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [usage, setUsage] = useState<DailyUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);

  async function loadFiles() {
    setFilesLoading(true);
    setFilesError(null);
    try {
      const res = await fetch("/api/soul");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch {
      setFilesError("扫描 Soul 文件失败，请检查工作区路径设置");
    } finally {
      setFilesLoading(false);
    }
  }

  async function loadUsage() {
    setUsageLoading(true);
    try {
      const today = new Date();
      const from = new Date(today);
      from.setUTCDate(today.getUTCDate() - 40);
      const res = await fetch(`/api/usage?from=${toDateStr(from)}&to=${toDateStr(today)}`);
      const data = await res.json();
      setUsage(data.data ?? []);
    } catch {
      setUsage([]);
    } finally {
      setUsageLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
    loadUsage();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Soul · 用量</h1>
        <Button variant="ghost" onClick={() => { loadFiles(); loadUsage(); }} title="刷新">
          <RefreshCw size={14} />
        </Button>
      </div>

      <Card className="p-4">
        <UsageHeatmap usage={usage} loading={usageLoading} />
      </Card>

      <Card className="p-4">
        <ModelBreakdown usage={usage} />
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Soul 快捷编辑</h2>
        {filesLoading && <p className="text-sm text-neutral-400">扫描工作区中…</p>}
        {filesError && <p className="text-sm text-red-500">{filesError}</p>}
        {!filesLoading && !filesError && files.length === 0 && (
          <p className="text-sm text-neutral-400">
            未找到 SOUL.md / AGENTS.md / IDENTITY.md / USER.md / TOOLS.md / MEMORY.md 或 *.soul.md 文件
          </p>
        )}
        <div className="flex flex-col gap-2">
          {files.map((file) => (
            <SoulCard key={file.path} file={file} />
          ))}
        </div>
      </div>
    </div>
  );
}
