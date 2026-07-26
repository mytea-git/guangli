"use client";

// 自托管 Monaco 的 AMD 版本（public/monaco/vs，由
// scripts/copy-monaco-assets.mjs 在 npm install 后从 node_modules 复制
// 而来），而不是 @monaco-editor/react 默认走 jsdelivr CDN——这样后台在
// 没有公网访问的内网/离线环境里也能正常使用代码编辑器。
//
// workerMain.js 是 Monaco AMD 版自带的通用 worker 入口，内部会根据
// 消息自行加载对应语言的 worker 模块，不需要按语言分别注册 worker 文件
// ——早期尝试过手写 `new Worker(new URL(".../xxx.worker.js", import.meta.url))`
// 逐个语言接线，但 Next.js 的 webpack 配置没有把这些当作独立 worker
// chunk 处理（构建产物里根本没生成对应的 worker 文件），改用 AMD 版
// 自带的 workerMain.js 更简单也更可靠。
import { loader } from "@monaco-editor/react";

let configured = false;

export function ensureMonacoConfigured() {
  if (configured) return;
  configured = true;

  // monaco-editor 的类型声明里已经全局声明了 Window.MonacoEnvironment
  // （类型是 esm 版的 Environment），这里用的是 AMD 版的最小接口，
  // 用类型断言赋值即可，不需要也不应该再声明一份全局接口。
  (window as unknown as { MonacoEnvironment: { getWorkerUrl: () => string } }).MonacoEnvironment = {
    getWorkerUrl: () => "/monaco/vs/base/worker/workerMain.js",
  };

  loader.config({ paths: { vs: "/monaco/vs" } });
}
