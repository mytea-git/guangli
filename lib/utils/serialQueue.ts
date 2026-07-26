import { getGlobalSingleton } from "./globalSingleton";

/**
 * 极简的按 key 分组异步串行队列——同一个 key 下提交的多个任务严格按
 * 提交顺序依次执行，不同 key 之间互不影响、可以并发跑。用于把"读-改-写"
 * 这类必须原子化的操作序列化，避免并发请求交错导致的竞态/丢更新
 * （jsonStore / assistant 会话存储 / 版本快照都需要这个能力，这里只
 * 实现一份，避免各处各写一份几乎相同的队列逻辑）。
 */
export function createSerialQueue(singletonKey: string) {
  function queues(): Map<string, Promise<unknown>> {
    return getGlobalSingleton(singletonKey, () => new Map<string, Promise<unknown>>());
  }

  return function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const q = queues();
    const prev = q.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    q.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  };
}
