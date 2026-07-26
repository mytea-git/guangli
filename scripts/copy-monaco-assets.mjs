#!/usr/bin/env node
// 把 monaco-editor 自带的 AMD 版静态资源（min/vs）从 node_modules 复制到
// public/monaco/vs，供前端自托管加载——不依赖 jsdelivr CDN，离线/内网
// 环境也能正常使用代码编辑器。npm install 后通过 postinstall 自动执行。
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const dest = path.join(root, "public", "monaco", "vs");

async function main() {
  if (!existsSync(src)) {
    console.warn("[copy-monaco-assets] 未找到 node_modules/monaco-editor/min/vs，跳过复制。");
    return;
  }
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log("[copy-monaco-assets] 已将 monaco-editor AMD 资源复制到 public/monaco/vs");
}

main().catch((err) => {
  console.error("[copy-monaco-assets] 复制失败", err);
  process.exitCode = 1;
});
