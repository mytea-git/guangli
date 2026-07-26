"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RotateCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

const LOAD_TIMEOUT_MS = 8000;

type Status = "loading" | "ready" | "unreachable" | "timeout";

export function EmbedFrame({ url }: { url: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setStatus("loading");
    let cancelled = false;

    // 跨域 iframe 在目标彻底不可达（DNS 解析失败/连接被拒绝）时，
    // 浏览器会把 iframe 导航到它自己内部的错误页（如 Chrome 的
    // chrome-error://chromewebdata/），而这个导航本身仍然会触发
    // iframe 的 onLoad——从父页面角度完全看不出区别，8 秒超时也
    // 派不上用场（因为 onLoad 已经"成功"触发了）。用一个并行的
    // 可达性探测补上这个检测不到的场景。探测请求打到本站同源接口
    // `/api/connect/probe`（由服务端代为发起对目标地址的请求），而不是
    // 直接从浏览器 fetch 目标地址——直接 fetch 会被 CSP 的
    // `connect-src 'self'` 拦截（那正是我们想保留的默认收紧行为，不为
    // 这一个功能放宽全站 connect-src）。
    const probeController = new AbortController();
    fetch("/api/connect/probe", { signal: probeController.signal })
      .then((res) => res.json())
      .then((data: { reachable?: boolean }) => {
        if (!cancelled && !data.reachable) setStatus((s) => (s === "ready" ? s : "unreachable"));
      })
      .catch(() => {
        if (!cancelled) setStatus((s) => (s === "ready" ? s : "unreachable"));
      });

    // 目标网络可达、但加载异常缓慢，或者会加载成功却被 frame-ancestors
    // 拒绝渲染（这种情况下大多数浏览器同样会触发 onLoad，此超时更多是
    // 兜底真正缓慢的加载）——8 秒后仍处于 loading 才升级为 timeout。
    const timeoutTimer = setTimeout(() => {
      setStatus((s) => (s === "loading" ? "timeout" : s));
    }, LOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      probeController.abort();
      clearTimeout(timeoutTimer);
    };
  }, [url, attempt]);

  const hasProblem = status === "unreachable" || status === "timeout";

  return (
    <div className="relative h-[calc(100vh-9rem)] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <iframe
        key={attempt}
        src={url}
        // 如果预检测已经判定 unreachable，不要被随后到达的 onLoad（可能
        // 只是浏览器内部错误页"加载完成"）反过来又覆盖成 ready。
        onLoad={() => setStatus((s) => (s === "unreachable" ? s : "ready"))}
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
                {status === "unreachable"
                  ? "无法连接到该地址，请检查网关是否已启动、地址是否正确"
                  : "加载时间较长——可能是该网页不允许被嵌入（frame-ancestors）"}
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
