"use client";

import { useEffect, useRef, useState } from "react";
import type { ProviderEvent } from "@/lib/providers/types";

type StreamStatus = "connecting" | "open" | "reconnecting";

export function useEventStream(onEvent: (event: ProviderEvent) => void) {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const failuresRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let closed = false;
    const es = new EventSource("/api/stream");

    const handle = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data) as ProviderEvent;
        onEventRef.current(data);
      } catch {
        // 忽略格式异常的帧
      }
    };

    es.addEventListener("snapshot", handle);
    es.addEventListener("agents:update", handle);
    es.addEventListener("edges:update", handle);
    es.addEventListener("usage:tick", handle);

    es.onopen = () => {
      failuresRef.current = 0;
      setStatus("open");
    };

    es.onerror = () => {
      if (closed) return;
      failuresRef.current += 1;
      setStatus("reconnecting");
      // EventSource 会自行按 `retry:` 指令重连；连续失败几次后，
      // 很可能是会话过期（401），主动确认一次并跳转登录页。
      if (failuresRef.current >= 3) {
        fetch("/api/auth/session")
          .then((res) => {
            if (res.status === 401) {
              window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname);
            }
          })
          .catch(() => {
            // 网络波动，交给 EventSource 继续自动重试
          });
      }
    };

    return () => {
      closed = true;
      es.close();
    };
  }, []);

  return { status };
}
