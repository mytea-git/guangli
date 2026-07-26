"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { FilePlus, FolderPlus, RefreshCw, History } from "lucide-react";
import { FileTree } from "@/components/files/FileTree";
import { EditorTabs } from "@/components/files/EditorTabs";
import { FileContextMenu, type ContextMenuItem } from "@/components/files/FileContextMenu";
import { VersionHistoryPanel } from "@/components/versions/VersionHistoryPanel";
import { Button } from "@/components/ui/Button";
import { useFilesStore } from "@/stores/filesStore";
import { useToastStore } from "@/stores/toastStore";
import { useTheme } from "@/hooks/useTheme";
import type { FileTreeEntry } from "@/lib/files/service";

// Monaco 会访问 window，必须禁用 SSR。
const MonacoPane = dynamic(() => import("@/components/files/MonacoPane").then((m) => m.MonacoPane), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-400">加载编辑器…</div>
  ),
});

interface MenuState {
  x: number;
  y: number;
  entry: FileTreeEntry;
}

export default function FilesPage() {
  const {
    tree,
    loadingTree,
    treeError,
    tabs,
    activeTabPath,
    setTree,
    setLoadingTree,
    setTreeError,
    openTab,
    closeTab,
    setActiveTab,
    updateTabContent,
    markSaved,
  } = useFilesStore();
  const pushToast = useToastStore((s) => s.push);
  const { resolvedDark } = useTheme();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const [historyPath, setHistoryPath] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoadingTree(true);
    setTreeError(null);
    try {
      const res = await fetch("/api/files/tree");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setTree(data);
    } catch {
      setTreeError("加载工作区文件失败，请检查工作区路径设置");
    } finally {
      setLoadingTree(false);
    }
  }, [setTree, setLoadingTree, setTreeError]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const activeTab = tabs.find((t) => t.path === activeTabPath) ?? null;

  async function handleOpenFile(entry: FileTreeEntry) {
    const existing = tabs.find((t) => t.path === entry.path);
    if (existing) {
      setActiveTab(entry.path);
      return;
    }
    openTab({
      path: entry.path,
      name: entry.name,
      content: "",
      originalContent: "",
      modifiedAt: null,
      loading: true,
      error: null,
    });
    try {
      const res = await fetch(`/api/files/content?path=${encodeURIComponent(entry.path)}`);
      if (res.status === 415) {
        openTab({
          path: entry.path,
          name: entry.name,
          content: "",
          originalContent: "",
          modifiedAt: null,
          loading: false,
          error: "该文件为二进制文件，暂不支持在线编辑",
        });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        openTab({
          path: entry.path,
          name: entry.name,
          content: "",
          originalContent: "",
          modifiedAt: null,
          loading: false,
          error: data.error || "读取失败",
        });
        return;
      }
      const data = await res.json();
      openTab({
        path: entry.path,
        name: entry.name,
        content: data.content,
        originalContent: data.content,
        modifiedAt: data.modifiedAt,
        loading: false,
        error: null,
      });
    } catch {
      openTab({
        path: entry.path,
        name: entry.name,
        content: "",
        originalContent: "",
        modifiedAt: null,
        loading: false,
        error: "网络错误",
      });
    }
  }

  const handleSave = useCallback(async () => {
    const tab = useFilesStore.getState().tabs.find((t) => t.path === useFilesStore.getState().activeTabPath);
    if (!tab) return;
    try {
      const res = await fetch("/api/files/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: tab.path,
          content: tab.content,
          knownModifiedAt: tab.modifiedAt ?? undefined,
        }),
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
      markSaved(tab.path, data.modifiedAt!);
      pushToast("已保存", "success");
      loadTree();
    } catch {
      pushToast("网络错误，保存失败", "error");
    }
  }, [pushToast, markSaved, loadTree]);

  async function reloadTabContent(path: string) {
    const entry = { path, name: path.split("/").pop() ?? path, type: "file" as const };
    await handleOpenFileForced(entry);
  }

  // handleOpenFile 会在 tab 已存在时直接切换过去而不重新拉取内容；
  // 版本恢复后需要强制重新拉取磁盘上的最新内容，所以单独抽一个不走
  // "已存在则跳过"分支的版本。
  async function handleOpenFileForced(entry: FileTreeEntry) {
    try {
      const res = await fetch(`/api/files/content?path=${encodeURIComponent(entry.path)}`);
      if (!res.ok) return;
      const data = await res.json();
      openTab({
        path: entry.path,
        name: entry.name,
        content: data.content,
        originalContent: data.content,
        modifiedAt: data.modifiedAt,
        loading: false,
        error: null,
      });
    } catch {
      // 恢复已经成功，只是刷新展示失败——不弹错误打扰用户，用户可手动重新打开
    }
  }

  function requestClose(path: string) {
    const tab = tabs.find((t) => t.path === path);
    if (tab && tab.content !== tab.originalContent) {
      setPendingClose(path);
      return;
    }
    closeTab(path);
  }

  function handleContextMenu(e: React.MouseEvent, entry: FileTreeEntry) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, entry });
  }

  async function handleCreate(parent: FileTreeEntry, kind: "file" | "dir") {
    const name = window.prompt(kind === "file" ? "新文件名" : "新文件夹名");
    if (!name) return;
    const base = parent.type === "dir" ? parent.path : parent.path.split("/").slice(0, -1).join("/");
    const path = base ? `${base}/${name}` : name;
    const res = await fetch("/api/files/op", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", path, kind }),
    });
    const data = await res.json().catch(() => ({}) as { error?: string });
    if (!res.ok) {
      pushToast(data.error || "创建失败", "error");
      return;
    }
    pushToast("已创建", "success");
    loadTree();
  }

  async function handleRename(entry: FileTreeEntry) {
    const name = window.prompt("重命名为", entry.name);
    if (!name || name === entry.name) return;
    const parentPath = entry.path.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${name}` : name;
    const res = await fetch("/api/files/op", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "rename", path: entry.path, newPath }),
    });
    const data = await res.json().catch(() => ({}) as { error?: string });
    if (!res.ok) {
      pushToast(data.error || "重命名失败", "error");
      return;
    }
    if (tabs.some((t) => t.path === entry.path)) closeTab(entry.path);
    pushToast("已重命名", "success");
    loadTree();
  }

  async function handleDelete(entry: FileTreeEntry) {
    const ok = window.confirm(
      `确定删除「${entry.name}」吗？${entry.type === "dir" ? "（将删除其中所有内容）" : ""}`,
    );
    if (!ok) return;
    const res = await fetch("/api/files/op", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "delete", path: entry.path, recursive: entry.type === "dir" }),
    });
    const data = await res.json().catch(() => ({}) as { error?: string });
    if (!res.ok) {
      pushToast(data.error || "删除失败", "error");
      return;
    }
    closeTab(entry.path);
    pushToast("已删除", "success");
    loadTree();
  }

  function menuItems(entry: FileTreeEntry): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    if (entry.type === "dir") {
      items.push({ label: "新建文件", onClick: () => handleCreate(entry, "file") });
      items.push({ label: "新建文件夹", onClick: () => handleCreate(entry, "dir") });
    }
    if (entry.path) {
      items.push({ label: "重命名", onClick: () => handleRename(entry) });
      items.push({ label: "删除", onClick: () => handleDelete(entry), danger: true });
    }
    return items;
  }

  // 全局 Ctrl+S 兜底：焦点不在编辑器内（例如刚点完文件树）时也能保存。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-2">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">代码管理</h1>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" onClick={() => tree && handleCreate(tree, "file")} title="新建文件">
            <FilePlus size={14} />
          </Button>
          <Button variant="ghost" onClick={() => tree && handleCreate(tree, "dir")} title="新建文件夹">
            <FolderPlus size={14} />
          </Button>
          <Button variant="ghost" onClick={loadTree} title="刷新">
            <RefreshCw size={14} />
          </Button>
          <Button
            variant="ghost"
            onClick={() => activeTab && setHistoryPath(activeTab.path)}
            disabled={!activeTab}
            title="版本历史"
          >
            <History size={14} />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="w-64 shrink-0 overflow-y-auto border-r border-neutral-200 p-2 dark:border-neutral-800">
          {loadingTree && <p className="p-2 text-sm text-neutral-400">加载中…</p>}
          {treeError && <p className="p-2 text-sm text-red-500">{treeError}</p>}
          {tree && (
            <FileTree
              entry={tree}
              activePath={activeTabPath}
              onOpenFile={handleOpenFile}
              onContextMenu={handleContextMenu}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {tabs.length > 0 && (
            <EditorTabs tabs={tabs} activePath={activeTabPath} onSelect={setActiveTab} onClose={requestClose} />
          )}
          <div className="min-h-0 flex-1">
            {!activeTab && (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                从左侧选择一个文件开始编辑
              </div>
            )}
            {activeTab?.loading && (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">加载文件内容…</div>
            )}
            {activeTab && !activeTab.loading && activeTab.error && (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                {activeTab.error}
              </div>
            )}
            {activeTab && !activeTab.loading && !activeTab.error && (
              <MonacoPane
                path={activeTab.path}
                value={activeTab.content}
                onChange={(v) => updateTabContent(activeTab.path, v)}
                onSave={handleSave}
                theme={resolvedDark ? "dark" : "light"}
              />
            )}
          </div>
        </div>
      </div>
      {menu && <FileContextMenu x={menu.x} y={menu.y} items={menuItems(menu.entry)} onClose={() => setMenu(null)} />}
      {pendingClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-80 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <p className="mb-4 text-sm">该文件有未保存的修改，是否放弃？</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingClose(null)}>
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  closeTab(pendingClose);
                  setPendingClose(null);
                }}
              >
                放弃修改
              </Button>
            </div>
          </div>
        </div>
      )}
      {historyPath && (
        <VersionHistoryPanel
          kind="workspace"
          path={historyPath}
          onClose={() => setHistoryPath(null)}
          onRestored={() => reloadTabContent(historyPath)}
        />
      )}
    </div>
  );
}
