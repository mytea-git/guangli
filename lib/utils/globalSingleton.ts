// 开发模式下 Next.js HMR 会重新执行模块顶层代码，导致定时器/订阅总线等
// "只应存在一份" 的状态被重复创建（症状：mock 引擎多跑一份、用量翻倍）。
// 把这类单例挂在 globalThis 上，保证同一进程内只初始化一次。
export function getGlobalSingleton<T>(key: string, factory: () => T): T {
  const bucket = globalThis as unknown as Record<string, unknown>;
  const namespaced = "__guangli__" + key;
  if (bucket[namespaced] === undefined) {
    bucket[namespaced] = factory();
  }
  return bucket[namespaced] as T;
}
