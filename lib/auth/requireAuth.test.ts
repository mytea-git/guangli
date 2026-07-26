import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

// getAuthRecord() 内部会读 DATA_DIR 下的 auth.json（真实文件系统），requireAuth
// 只关心它返回的 tokenVersion，所以这里 mock 掉，避免测试依赖磁盘状态，
// 写法与 lib/assistant/tools.test.ts 里 mock 协作模块的方式保持一致。
const mockGetAuthRecord = vi.fn();
vi.mock("@/lib/store/auth", () => ({
  getAuthRecord: mockGetAuthRecord,
}));

const { requireAuth, AuthError } = await import("./requireAuth");
const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");

const VALID_SECRET = "c".repeat(40);
const CURRENT_TOKEN_VERSION = 5;

/** 构造一个只带 requireAuth 用得到的那一部分接口的假 NextRequest。 */
function fakeRequest(cookieValue: string | undefined): NextRequest {
  return {
    cookies: {
      get: (name: string) => {
        if (name !== SESSION_COOKIE) return undefined;
        return cookieValue === undefined ? undefined : { value: cookieValue };
      },
    },
  } as unknown as NextRequest;
}

describe("requireAuth", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = VALID_SECRET;
    mockGetAuthRecord.mockReset();
    mockGetAuthRecord.mockResolvedValue({
      passwordHash: "irrelevant",
      updatedAt: new Date().toISOString(),
      bootstrapped: false,
      tokenVersion: CURRENT_TOKEN_VERSION,
    });
  });

  afterEach(() => {
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it("cookie 里的 token 版本号与当前记录一致时正常放行（不抛错）", async () => {
    const token = await signSession(CURRENT_TOKEN_VERSION);
    await expect(requireAuth(fakeRequest(token))).resolves.toBeUndefined();
  });

  it("完全没有 cookie 时抛出 AuthError", async () => {
    await expect(requireAuth(fakeRequest(undefined))).rejects.toThrow(AuthError);
  });

  it("token 签名合法，但版本号与当前记录不一致时抛出 AuthError（改密码后旧会话应失效）", async () => {
    // 模拟场景：token 是改密码之前签发的，version 落后于 auth.json 里
    // 改密后递增的 tokenVersion——这正是"改密即让其它会话失效"这条安全
    // 性质要保证的核心行为。
    const staleToken = await signSession(CURRENT_TOKEN_VERSION - 1);
    await expect(requireAuth(fakeRequest(staleToken))).rejects.toThrow(AuthError);
  });

  it("cookie 值是乱七八糟的字符串时抛出 AuthError", async () => {
    await expect(requireAuth(fakeRequest("this-is-not-a-jwt"))).rejects.toThrow(AuthError);
  });
});
