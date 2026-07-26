import { create } from "zustand";
import type { FileTreeEntry } from "@/lib/files/service";

export interface OpenTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  /** 服务器已知的 mtime，用于 PUT 时的并发冲突检测；二进制/加载失败时为 null。 */
  modifiedAt: string | null;
  loading: boolean;
  error: string | null;
}

interface FilesState {
  tree: FileTreeEntry | null;
  loadingTree: boolean;
  treeError: string | null;
  tabs: OpenTab[];
  activeTabPath: string | null;
  setTree: (tree: FileTreeEntry | null) => void;
  setLoadingTree: (loading: boolean) => void;
  setTreeError: (err: string | null) => void;
  openTab: (tab: OpenTab) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateTabContent: (path: string, content: string) => void;
  markSaved: (path: string, modifiedAt: string) => void;
}

export const useFilesStore = create<FilesState>((set, get) => ({
  tree: null,
  loadingTree: false,
  treeError: null,
  tabs: [],
  activeTabPath: null,
  setTree: (tree) => set({ tree }),
  setLoadingTree: (loading) => set({ loadingTree: loading }),
  setTreeError: (treeError) => set({ treeError }),
  openTab: (tab) => {
    const exists = get().tabs.some((t) => t.path === tab.path);
    set((s) => ({
      tabs: exists ? s.tabs.map((t) => (t.path === tab.path ? tab : t)) : [...s.tabs, tab],
      activeTabPath: tab.path,
    }));
  },
  closeTab: (path) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      const activeTabPath =
        s.activeTabPath === path ? (tabs[tabs.length - 1]?.path ?? null) : s.activeTabPath;
      return { tabs, activeTabPath };
    });
  },
  setActiveTab: (path) => set({ activeTabPath: path }),
  updateTabContent: (path, content) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, content } : t)) })),
  markSaved: (path, modifiedAt) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, originalContent: t.content, modifiedAt } : t)),
    })),
}));
