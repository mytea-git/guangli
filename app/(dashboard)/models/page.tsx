"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Check, Cpu, Globe } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils/cn";
import type { OpenClawConfig } from "@/lib/models/openclawConfig";
import type { CatalogCache } from "@/lib/models/types";

const SOURCE_LABEL: Record<CatalogCache["source"], string> = {
  anthropic: "Anthropic API",
  "openai-compatible": "OpenAI 兼容 API",
  openrouter: "OpenRouter 公共目录",
  static: "内置静态目录（离线回退）",
};

export default function ModelsPage() {
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [catalog, setCatalog] = useState<CatalogCache | null>(null);
  const [activeModel, setActiveModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const pushToast = useToastStore((s) => s.push);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setConfig(data.config ?? null);
      setCatalog(data.catalog ?? null);
      setActiveModel(data.activeModel ?? "");
    } catch {
      pushToast("加载模型信息失败", "error");
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/models/refresh", { method: "POST" });
      const data: { error?: string; catalog?: CatalogCache } = await res
        .json()
        .catch(() => ({}) as { error?: string; catalog?: CatalogCache });
      if (!res.ok) {
        pushToast(data.error || "联网获取失败", "error");
        return;
      }
      const nextCatalog = data.catalog ?? null;
      setCatalog(nextCatalog);
      const label = nextCatalog ? SOURCE_LABEL[nextCatalog.source] : "未知来源";
      pushToast(
        nextCatalog?.source === "static" ? `联网获取失败，已回退到${label}` : `已从${label}更新模型目录`,
        nextCatalog?.source === "static" ? "error" : "success",
      );
    } catch {
      pushToast("网络错误", "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleActivate(modelId: string) {
    if (modelId === activeModel) return;
    setActivating(modelId);
    try {
      const res = await fetch("/api/models/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        pushToast(data.error || "切换失败", "error");
        return;
      }
      setActiveModel(modelId);
      pushToast(`已切换到 ${modelId}`, "success");
    } catch {
      pushToast("网络错误，切换失败", "error");
    } finally {
      setActivating(null);
    }
  }

  const effectiveModel = activeModel || config?.model?.id || "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">模型配置</h1>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <Globe size={14} />
          {refreshing ? "获取中…" : "联网获取"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">加载中…</p>
      ) : (
        <>
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">当前配置（来自工作区 config/openclaw.json）</h2>
            {config?.model ? (
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-neutral-400">提供方</p>
                  <p>{config.model.provider}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400">模型 ID</p>
                  <p className="truncate">{config.model.id}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400">温度（temperature）</p>
                  <p>{config.model.temperature ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400">最大 token 数</p>
                  <p>{config.model.maxTokens ?? "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">未在工作区找到 config/openclaw.json 中的模型配置</p>
            )}
            {activeModel && activeModel !== config?.model?.id && (
              <p className="mt-3 text-xs text-amber-600 dark:text-amber-500">
                当前实际生效模型已通过快速切换改为 <span className="font-medium">{activeModel}</span>
                （不影响配置文件本身）
              </p>
            )}
            {config?.agents && config.agents.length > 0 && (
              <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                <p className="mb-2 text-xs text-neutral-400">各智能体默认模型</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {config.agents.map((a) => (
                    <span
                      key={a.id}
                      className="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800"
                    >
                      {a.name}：{a.model}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">模型目录（点击卡片快速切换）</h2>
              <span className="text-xs text-neutral-400">
                来源：{catalog ? SOURCE_LABEL[catalog.source] : "—"}
                {catalog?.fetchedAt && ` · 更新于 ${new Date(catalog.fetchedAt).toLocaleString("zh-CN")}`}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(catalog?.models ?? []).map((m) => {
                const isActive = m.id === effectiveModel;
                return (
                  <Card
                    key={m.id}
                    className={cn(
                      "cursor-pointer p-4 transition-colors hover:border-neutral-400 dark:hover:border-neutral-600",
                      isActive && "border-neutral-900 dark:border-neutral-100",
                    )}
                    onClick={() => handleActivate(m.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Cpu size={14} className="shrink-0 text-neutral-400" />
                        <span className="truncate text-sm font-medium">{m.name}</span>
                      </div>
                      {isActive && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-white dark:bg-neutral-100 dark:text-neutral-900">
                          <Check size={10} />
                          使用中
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-400">{m.id}</p>
                    {m.contextWindow && (
                      <p className="mt-1 text-xs text-neutral-400">
                        上下文窗口：{(m.contextWindow / 1000).toFixed(0)}K
                      </p>
                    )}
                    {activating === m.id && <p className="mt-1 text-xs text-neutral-400">切换中…</p>}
                  </Card>
                );
              })}
              {(!catalog || catalog.models.length === 0) && (
                <p className="text-sm text-neutral-400">暂无模型目录数据</p>
              )}
            </div>
          </div>
        </>
      )}
      <Button variant="ghost" onClick={load} className="self-start" title="刷新">
        <RefreshCw size={14} />
      </Button>
    </div>
  );
}
