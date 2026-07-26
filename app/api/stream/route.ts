import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { getProvider } from "@/lib/providers";
import type { ProviderEvent } from "@/lib/providers/types";
import { getGlobalSingleton } from "@/lib/utils/globalSingleton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CONNECTIONS = 20;
const HEARTBEAT_MS = 15000;

function connectionState() {
  return getGlobalSingleton("sseConnections", () => ({ count: 0 }));
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    throw err;
  }

  const conns = connectionState();
  if (conns.count >= MAX_CONNECTIONS) {
    return NextResponse.json({ error: "连接数已达上限，请稍后再试" }, { status: 503 });
  }

  const provider = getProvider();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    conns.count = Math.max(0, conns.count - 1);
  }

  const stream = new ReadableStream({
    async start(controller) {
      conns.count += 1;

      const send = (event: ProviderEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller 已关闭（客户端断开），忽略后续写入
        }
      };

      controller.enqueue(encoder.encode(`retry: 3000\n\n`));

      const snapshot = await provider.getSnapshot();
      send({ type: "snapshot", ...snapshot });

      unsubscribe = provider.subscribe(send);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: hb\n\n`));
        } catch {
          // ignore
        }
      }, HEARTBEAT_MS);

      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
