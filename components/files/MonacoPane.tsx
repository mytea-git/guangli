"use client";

import { useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { ensureMonacoConfigured } from "@/lib/monaco/setup";

// 必须在模块顶层（而不是组件内的 useEffect 里）同步调用：React 先执行
// 子组件的 effect 再执行父组件的 effect，如果放进 MonacoPane 的
// useEffect，<Editor> 自己内部的懒加载 effect 会先跑，抢先用默认的
// jsdelivr CDN 配置把 loader 初始化掉，我们的 loader.config() 就晚了。
// 这个模块只会经由 files/page.tsx 的 next/dynamic(ssr:false) 间接懒加载，
// 不会进入服务端渲染路径，因此在顶层直接执行是安全的。
ensureMonacoConfigured();

const LANGUAGE_MAP: Record<string, string> = {
  md: "markdown",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  go: "go",
  rs: "rust",
  sh: "shell",
  bash: "shell",
  sql: "sql",
  txt: "plaintext",
};

function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_MAP[ext] ?? "plaintext";
}

interface MonacoPaneProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  theme: "light" | "dark";
}

export function MonacoPane({ path, value, onChange, onSave, theme }: MonacoPaneProps) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current();
    });
  };

  return (
    <Editor
      key={path}
      language={languageFromPath(path)}
      value={value}
      theme={theme === "dark" ? "vs-dark" : "light"}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  );
}
