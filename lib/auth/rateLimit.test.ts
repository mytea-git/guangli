import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import { checkRateLimit, clientIpFrom, checkGeneralApiRateLimit } from "./rateLimit";

// checkRateLimit 底层的桶表挂在 globalThis 单例上，进程内所有测试共享
// 同一张表——所以每个用例都必须用独一无二的 key，否则前面用例攒下的
// 计数会串到后面的用例里，导致断言忽真忽假。
function uniqueKey(prefix = "test") {
  return `${prefix}-${crypto.randomUUID()}`;
}

describe("checkRateLimit", () => {
  it("在 maxAttempts 次数以内都放行，超出后拒绝且带正的 retryAfterSec", () => {
    const key = uniqueKey();
    const opts = { windowMs: 60_000, maxAttempts: 5 };

    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, opts);
      expect(result.allowed).toBe(true);
    }

    const blocked = checkRateLimit(key, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("不同 key 的桶互相独立，一个 key 耗尽不影响另一个 key", () => {
    const keyA = uniqueKey("a");
    const keyB = uniqueKey("b");
    const opts = { windowMs: 60_000, maxAttempts: 1 };

    expect(checkRateLimit(keyA, opts).allowed).toBe(true);
    // keyA 已耗尽，立刻应被拒绝
    expect(checkRateLimit(keyA, opts).allowed).toBe(false);

    // keyB 是全新的桶，不受 keyA 状态影响
    expect(checkRateLimit(keyB, opts).allowed).toBe(true);
  });

  it("窗口过期后桶重置，重新开始放行", async () => {
    const key = uniqueKey();
    const opts = { windowMs: 50, maxAttempts: 1 };

    expect(checkRateLimit(key, opts).allowed).toBe(true);
    expect(checkRateLimit(key, opts).allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 80));

    expect(checkRateLimit(key, opts).allowed).toBe(true);
  });
});

describe("clientIpFrom", () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = originalTrustProxy;
    }
  });

  function fakeReq(xffValue: string | null) {
    return {
      headers: {
        get: (name: string) => (name === "x-forwarded-for" ? xffValue : null),
      },
    };
  }

  // 回归测试的核心：未信任反代时，无论客户端在 XFF 里塞什么伪造值，
  // 都必须一律返回固定的 "local"——这是修复"XFF 无条件信任导致限流
  // 可被绕过"这一漏洞的关键行为。
  it("TRUST_PROXY 未设置时，即使带有攻击者伪造的 x-forwarded-for 也返回 local", () => {
    delete process.env.TRUST_PROXY;
    const req = fakeReq("6.6.6.6");
    expect(clientIpFrom(req)).toBe("local");
  });

  it('TRUST_PROXY="0" 时同样返回 local，不读取 x-forwarded-for', () => {
    process.env.TRUST_PROXY = "0";
    const req = fakeReq("6.6.6.6");
    expect(clientIpFrom(req)).toBe("local");
  });

  it('TRUST_PROXY="1" 且多跳时取最右一跳（反代真实观测到的对端），而非最左的客户端可伪造值', () => {
    process.env.TRUST_PROXY = "1";
    const req = fakeReq("1.2.3.4, 5.6.7.8");
    expect(clientIpFrom(req)).toBe("5.6.7.8");
  });

  it('TRUST_PROXY="1" 且只有单跳时直接返回该值', () => {
    process.env.TRUST_PROXY = "1";
    const req = fakeReq("9.9.9.9");
    expect(clientIpFrom(req)).toBe("9.9.9.9");
  });

  it('TRUST_PROXY="1" 但请求完全没有 x-forwarded-for 头时回退为 local', () => {
    process.env.TRUST_PROXY = "1";
    const req = fakeReq(null);
    expect(clientIpFrom(req)).toBe("local");
  });
});

describe("checkGeneralApiRateLimit", () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = originalTrustProxy;
    }
  });

  function fakeReqWithIp(ip: string) {
    return {
      headers: {
        get: (name: string) => (name === "x-forwarded-for" ? ip : null),
      },
    };
  }

  it("组合 clientIpFrom 与 checkRateLimit：不同模拟 IP 各自拥有独立的桶", () => {
    process.env.TRUST_PROXY = "1";
    // 用随机后缀避免和其它用例/其它测试文件里的 IP 撞上同一个 api: 桶
    const ipA = `10.0.0.${Math.floor(Math.random() * 1000)}`;
    const ipB = `10.0.1.${Math.floor(Math.random() * 1000)}`;

    const resultA = checkGeneralApiRateLimit(fakeReqWithIp(ipA));
    expect(resultA.allowed).toBe(true);

    const resultB = checkGeneralApiRateLimit(fakeReqWithIp(ipB));
    expect(resultB.allowed).toBe(true);

    // 同一个 IP 再次调用仍应放行（还远没到 120 次上限），验证没有
    // 意外地互相干扰计数
    expect(checkGeneralApiRateLimit(fakeReqWithIp(ipA)).allowed).toBe(true);
  });
});
