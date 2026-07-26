import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DailyUsage } from "@/lib/providers/types";

// 与 jsonStore.test.ts 同样的原因：usage.ts 内部通过 jsonStore 的
// readJson/writeJson 读写磁盘，而 jsonStore 的 DATA_DIR 在"模块被首次
// 加载时"就求值成常量。所以每个用例都必须先设置 process.env.DATA_DIR、
// 再 vi.resetModules()，最后动态 import——绝不能在文件顶层静态 import，
// 否则会在 beforeEach 跑之前就把 DATA_DIR 锁死成真实的 cwd/data 目录。
//
// 此外 usage.ts 把内存状态（byDate/loaded/flushTimer）挂在 globalThis 的
// "__guangli__usageState" 键下（getGlobalSingleton），这个键不受
// vi.resetModules() 影响——resetModules 只是让下次 import 拿到全新的模块
// 实例，但模块内部调用 getGlobalSingleton 时仍会读到上一个用例留下的、
// 挂在真实 globalThis 上的旧单例对象。因此必须在每个用例动态 import
// 之前手动删掉这个键，保证 initUsage()/recordUsageTick() 都是从一个真正
// 干净的 Map 开始。
const USAGE_STATE_KEY = "__guangli__usageState";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "guangli-usage-"));
  process.env.DATA_DIR = tmpDir;
  vi.resetModules();
  delete (globalThis as unknown as Record<string, unknown>)[USAGE_STATE_KEY];
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete (globalThis as unknown as Record<string, unknown>)[USAGE_STATE_KEY];
});

// 独立计算某个 IANA 时区下"今天"的日期字符串，与 usage.ts 内部 todayKey()
// 使用的是完全相同的格式化方式（en-CA 恰好产出 YYYY-MM-DD）。用来验证
// recordUsageTick 真的把 timezone 参数传下去参与了日期计算，而不是不管
// 传入什么都固定按 Asia/Shanghai 算。
function expectedDateKey(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

describe("usage store", () => {
  it("recordUsageTick 在从未调用过 initUsage() 时也能正常记账，并返回 YYYY-MM-DD 形状的日期字符串", async () => {
    const { recordUsageTick } = await import("@/lib/store/usage");

    const date = recordUsageTick("gpt-test", 10, 20);

    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("同一模型同一天记两次 tick 会累加 tokens/calls，而不是互相覆盖", async () => {
    const { recordUsageTick, getUsageRange } = await import("@/lib/store/usage");

    const date1 = recordUsageTick("gpt-test", 100, 50);
    const date2 = recordUsageTick("gpt-test", 30, 15);
    expect(date2).toBe(date1); // 两次调用间隔极短，理应落在同一天

    const range = await getUsageRange(date1, date1);

    expect(range).toHaveLength(1);
    expect(range[0].date).toBe(date1);
    expect(range[0].models["gpt-test"]).toEqual({
      inputTokens: 130,
      outputTokens: 65,
      calls: 2,
    });
  });

  it("同一天内两个不同模型的 tick 各自在 models{} 下有独立的 key 和独立的累计值", async () => {
    const { recordUsageTick, getUsageRange } = await import("@/lib/store/usage");

    const date = recordUsageTick("model-a", 10, 1);
    recordUsageTick("model-b", 200, 20);
    recordUsageTick("model-a", 5, 2);

    const range = await getUsageRange(date, date);

    expect(range).toHaveLength(1);
    expect(range[0].models["model-a"]).toEqual({ inputTokens: 15, outputTokens: 3, calls: 2 });
    expect(range[0].models["model-b"]).toEqual({ inputTokens: 200, outputTokens: 20, calls: 1 });
  });

  it("recordUsageTick 会把传入的 timezone 参数真正用于计算日期，而不是永远按默认时区算", async () => {
    const { recordUsageTick } = await import("@/lib/store/usage");

    // 选两个当前 UTC 偏移差异很大的时区（+14 与 -11，相差 25 小时），
    // 用独立算出来的期望值分别校验——不依赖能否控制当前具体时刻，
    // 只验证"传什么时区就按什么时区算"这条性质本身。
    const tzA = "Pacific/Kiritimati"; // UTC+14
    const tzB = "Pacific/Pago_Pago"; // UTC-11

    const dateA = recordUsageTick("model-tz", 1, 1, tzA);
    const dateB = recordUsageTick("model-tz", 1, 1, tzB);

    expect(dateA).toBe(expectedDateKey(tzA));
    expect(dateB).toBe(expectedDateKey(tzB));
    expect(dateA).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateB).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("recordUsageTick 不传 timezone 时，默认按 Asia/Shanghai 计算日期", async () => {
    const { recordUsageTick } = await import("@/lib/store/usage");

    const date = recordUsageTick("model-default-tz", 1, 1);

    expect(date).toBe(expectedDateKey("Asia/Shanghai"));
  });

  it("getUsageRange 按日期字符串区间过滤：区间覆盖今天时能读到记录，完全落在今天之后的区间则返回空数组", async () => {
    const { recordUsageTick, getUsageRange } = await import("@/lib/store/usage");

    const today = recordUsageTick("model-range", 1, 1);

    const coveringRange = await getUsageRange("1900-01-01", "2999-12-31");
    expect(coveringRange.some((d) => d.date === today)).toBe(true);

    // "9999-01-01" ~ "9999-12-31" 完全晚于今天（除非测试跑在公元 9999
    // 年——届时这条断言可以放心失效），用来证明区间过滤真的会排除
    // 落在范围之外的记录，而不是无条件返回全部数据。
    const afterRange = await getUsageRange("9999-01-01", "9999-12-31");
    expect(afterRange).toEqual([]);
  });

  it("resetUsage 清空内存中的用量记录，之后任何区间查询都返回空数组", async () => {
    const { recordUsageTick, resetUsage, getUsageRange } = await import("@/lib/store/usage");

    recordUsageTick("model-reset", 42, 24);
    resetUsage();

    const range = await getUsageRange("1900-01-01", "2999-12-31");
    expect(range).toEqual([]);
  });

  it("initUsage() 会把此前 writeJson 落盘过的 usage.json 内容加载进内存，而不只是依赖运行期的内存 tick", async () => {
    const persisted: DailyUsage[] = [
      {
        date: "2020-01-01",
        models: {
          "legacy-model": { inputTokens: 999, outputTokens: 111, calls: 3 },
        },
      },
    ];
    fs.writeFileSync(path.join(tmpDir, "usage.json"), JSON.stringify(persisted), "utf8");

    const { initUsage, getUsageRange } = await import("@/lib/store/usage");
    await initUsage();

    const range = await getUsageRange("2020-01-01", "2020-01-01");

    expect(range).toHaveLength(1);
    expect(range[0]).toEqual(persisted[0]);
  });

  it("recordUsageTick 触发的防抖落盘（5s 后）真的会把内存里的用量写入 usage.json", async () => {
    // 只伪造 setTimeout/clearTimeout，不伪造 Date 或其它定时器——
    // writeJson 落盘走的是真实的 fs/promises 异步 I/O（libuv 线程池），
    // 不是靠微任务队列驱动，伪造整套定时器反而会让"推进虚拟时间"和
    // "真实磁盘写入完成"这两件事脱节，导致断言时文件还没写完
    // （甚至 afterEach 已经把临时目录删掉了才姗姗来迟地报错）。
    // 策略是：只用假 setTimeout 把 5s 的防抖窗口瞬间"跳过"触发回调，
    // 随后切回真实定时器，用 vi.waitFor 轮询等待真实的磁盘写入落地。
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const { recordUsageTick } = await import("@/lib/store/usage");
    const date = recordUsageTick("flush-model", 7, 3);

    vi.advanceTimersByTime(5100);
    vi.useRealTimers();

    const usageFile = path.join(tmpDir, "usage.json");
    await vi.waitFor(
      () => {
        if (!fs.existsSync(usageFile)) throw new Error("usage.json 尚未落盘");
      },
      { timeout: 2000, interval: 20 },
    );

    const raw = fs.readFileSync(usageFile, "utf8");
    const persisted = JSON.parse(raw) as DailyUsage[];

    expect(persisted).toHaveLength(1);
    expect(persisted[0].date).toBe(date);
    expect(persisted[0].models["flush-model"]).toEqual({ inputTokens: 7, outputTokens: 3, calls: 1 });
  });
});
