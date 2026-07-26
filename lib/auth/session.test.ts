import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import {
  signSession,
  verifySessionToken,
  verifySessionTokenVersion,
  sessionCookieOptions,
} from "@/lib/auth/session";

// secretKey() 在调用时才读取 process.env.AUTH_SECRET（不是在模块加载时缓存），
// 所以每个用例都可以直接改环境变量，不需要 vi.resetModules()。
const VALID_SECRET = "a".repeat(40);

// next/types/global.d.ts 把 NodeJS.ProcessEnv.NODE_ENV 声明成 readonly（供类型
// 收窄用），运行时其实可写——测试里需要临时切到 "production" 复现硬失败分支，
// 用 Object.defineProperty 绕开这个只读类型标注（PropertyDescriptor 不关心
// 目标属性原本是否 readonly）。
function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

describe("session", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = VALID_SECRET;
  });

  afterEach(() => {
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  describe("signSession + verifySessionToken 往返", () => {
    it("刚签发的 token 校验通过", async () => {
      const token = await signSession(1);
      await expect(verifySessionToken(token)).resolves.toBe(true);
    });
  });

  describe("signSession + verifySessionTokenVersion 往返", () => {
    it("能拿回签发时传入的确切版本号", async () => {
      const token = await signSession(42);
      await expect(verifySessionTokenVersion(token)).resolves.toBe(42);
    });

    it("版本号为 0 也能正确往返（不会被当成 falsy 丢弃）", async () => {
      const token = await signSession(0);
      await expect(verifySessionTokenVersion(token)).resolves.toBe(0);
    });
  });

  describe("verifySessionToken / verifySessionTokenVersion 对异常输入返回 false/null 而不是抛错", () => {
    it("undefined token", async () => {
      await expect(verifySessionToken(undefined)).resolves.toBe(false);
      await expect(verifySessionTokenVersion(undefined)).resolves.toBe(null);
    });

    it("null token", async () => {
      await expect(verifySessionToken(null)).resolves.toBe(false);
      await expect(verifySessionTokenVersion(null)).resolves.toBe(null);
    });

    it("空字符串", async () => {
      await expect(verifySessionToken("")).resolves.toBe(false);
      await expect(verifySessionTokenVersion("")).resolves.toBe(null);
    });

    it("语法上就不是合法 JWT 的字符串", async () => {
      await expect(verifySessionToken("not.a.jwt-at-all")).resolves.toBe(false);
      await expect(verifySessionTokenVersion("not.a.jwt-at-all")).resolves.toBe(null);
    });

    it("用错误密钥签发的、结构合法的 JWT 会被拒绝（证明能检测篡改）", async () => {
      const wrongSecret = new TextEncoder().encode("b".repeat(40));
      const tokenSignedWithWrongSecret = await new SignJWT({ role: "admin", v: 1 })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(wrongSecret);

      await expect(verifySessionToken(tokenSignedWithWrongSecret)).resolves.toBe(false);
      await expect(verifySessionTokenVersion(tokenSignedWithWrongSecret)).resolves.toBe(null);
    });
  });

  describe("verifySessionTokenVersion 对缺失/非数字 v 声明返回 null", () => {
    it("payload 里完全没有 v 字段", async () => {
      const secretBytes = new TextEncoder().encode(process.env.AUTH_SECRET!);
      const tokenWithoutV = await new SignJWT({ role: "admin" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secretBytes);

      // 签名和过期时间都合法，verifySessionToken 应该通过；
      // 但 verifySessionTokenVersion 因为拿不到数字版本号必须返回 null。
      await expect(verifySessionToken(tokenWithoutV)).resolves.toBe(true);
      await expect(verifySessionTokenVersion(tokenWithoutV)).resolves.toBe(null);
    });

    it("v 字段是非数字类型", async () => {
      const secretBytes = new TextEncoder().encode(process.env.AUTH_SECRET!);
      const tokenWithStringV = await new SignJWT({ role: "admin", v: "1" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secretBytes);

      await expect(verifySessionTokenVersion(tokenWithStringV)).resolves.toBe(null);
    });
  });

  describe("生产环境下 AUTH_SECRET 缺失/过短：secretKey() 硬失败", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      setNodeEnv(originalNodeEnv);
      // afterEach 顶层的那个已经会恢复 AUTH_SECRET，这里额外兜底避免执行顺序问题。
      process.env.AUTH_SECRET = VALID_SECRET;
    });

    it("signSession 直接 reject（没有内部 try/catch 兜底）", async () => {
      setNodeEnv("production");
      delete process.env.AUTH_SECRET;

      await expect(signSession(1)).rejects.toThrow();
    });

    it("verifySessionToken 内部吞掉这个异常，resolve 为 false 而不是抛错", async () => {
      setNodeEnv("production");
      process.env.AUTH_SECRET = "";

      await expect(verifySessionToken("anything.at.all")).resolves.toBe(false);
    });
  });

  describe("sessionCookieOptions", () => {
    const originalTrustProxy = process.env.TRUST_PROXY;

    afterEach(() => {
      if (originalTrustProxy === undefined) {
        delete process.env.TRUST_PROXY;
      } else {
        process.env.TRUST_PROXY = originalTrustProxy;
      }
    });

    it("TRUST_PROXY 未设置时 secure 为 false，其余字段为固定值", () => {
      delete process.env.TRUST_PROXY;
      const options = sessionCookieOptions();
      expect(options).toEqual({
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 604800,
      });
    });

    it("TRUST_PROXY='0' 时 secure 仍为 false", () => {
      process.env.TRUST_PROXY = "0";
      expect(sessionCookieOptions().secure).toBe(false);
    });

    it("TRUST_PROXY='1' 时 secure 为 true", () => {
      process.env.TRUST_PROXY = "1";
      const options = sessionCookieOptions();
      expect(options.secure).toBe(true);
      // 其它字段不受 TRUST_PROXY 影响，应保持不变。
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("lax");
      expect(options.path).toBe("/");
      expect(options.maxAge).toBe(604800);
    });
  });
});
