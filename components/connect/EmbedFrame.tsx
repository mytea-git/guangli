"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RotateCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

const LOAD_TIMEOUT_MS = 8000;

type Status = "loading" | "ready" | "timeout";

export function EmbedFrame({ url }: { url: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setStatus("loading");

    // 之前这里还有一个并行的 `fetch(url, {mode:'no-cors'})` 预检测请求，
    // 用来补上"跨域 iframe 目标彻底不可达时，浏览器仍会触发 onLoad
    // （导航到浏览器内部错误页也算一次 load）"这个检测盲区。但那个
    // fetch 请求本身会被 next.config.ts 里的 CSP `connect-src 'self'`
    // 拦截而必然 reject（因为目标是跨域地址）——不管 iframe 是否真的
    // 加载成功，探测请求永远失败，页面因此必现"无法连接到该地址"的
    // 错误提示，把一个正常工作的 iframe 也盖上假报错。
    // 收紧 CSP（M10）与这段探测逻辑（M6）互相冲突，两者不能同时满足：
    // 放宽 connect-src 允许任意地址会削弱 CSP 本身的防护意义，所以
    // 这里选择去掉探测请求，只依赖 iframe onLoad + 超时兜底——
    // 代价是"DNS 解析失败/连接被拒绝"这类场景会呈现为超时而不是立即
    // 的"无法连接"提示，但不会再出现"明明能用却报错"的情况。
    const timeoutTimer = setTimeout(() => {
      setStatus((s) => (s === "loading" ? "timeout" : s));
    }, LOAD_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutTimer);
    };
  }, [url, attempt]);

  const hasProblem = status === "timeout";

  return (
    <div className="relative h-[calc(100vh-9rem)] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <iframe
        key={attempt}
        src={url}
        onLoad={() => setStatus("ready")}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms"
        className="h-full w-full"
        title="OpenClaw 网页端"
      />
      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 px-6 text-center dark:bg-neutral-950/95">
          {status === "loading" && <p className="text-sm text-neutral-400">正在加载 {url} …</p>}
          {hasProblem && (
            <>
              <AlertTriangle size={20} className="text-amber-500" />
              <p className="text-sm text-neutral-500">
                加载时间较长——可能是网关未启动、地址不正确，或该网页不允许被嵌入（frame-ancestors）
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
                  <RotateCw size={14} />
                  重试
                </Button>
                <Button variant="primary" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                  <ExternalLink size={14} />
                  在新窗口打开
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
