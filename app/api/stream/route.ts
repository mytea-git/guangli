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
  let counted = false;
  let cleanedUp = false;

  // 幂等：cancel() 与 req.signal 的 abort 事件可能在极端情况下都被触发，
  // cleanedUp 保证计数只被归还一次，不会被减到比真实连接数还低（那样会
  // 让超过 MAX_CONNECTIONS 的连接也被放行）。counted 则保证只有真正
  // 占用过名额（getSnapshot() 成功之后）的连接才归还名额——否则初始
  // 快照获取失败的连接会让计数只增不减，攒够 20 次失败后整个端点就会
  // 一直 503，即使当下并没有 20 个真实的活跃连接。
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (counted) {
      conns.count = Math.max(0, conns.count - 1);
      counted = false;
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProviderEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller 已关闭（客户端断开），忽略后续写入
        }
      };

      controller.enqueue(encoder.encode(`retry: 3000\n\n`));

      let snapshot: Awaited<ReturnType<typeof provider.getSnapshot>>;
      try {
        snapshot = await provider.getSnapshot();
      } catch (err) {
        // 初始快照获取失败（如真实 provider 尚未实现）：不占用连接
        // 名额，通知客户端后直接关闭，而不是让计数只增不减地泄漏。
        console.error("[stream] 获取初始快照失败", err);
        try {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "获取初始状态失败" })}\n\n`),
          );
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
        return;
      }

      // 只在快照成功、真正开始占用一个长连接名额之后才计数，且必须
      // 紧接着同步完成 subscribe/heartbeat/abort 监听的注册（中间没有
      // await），避免这段时间内的客户端断开被漏掉清理。
      conns.count += 1;
      counted = true;

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
