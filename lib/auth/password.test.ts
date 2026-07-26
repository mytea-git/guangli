import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("hashPassword", () => {
  it("生成 scrypt$N,r,p$salt$hash 形状的字符串", async () => {
    const stored = await hashPassword("correct horse battery staple");
    const parts = stored.split("$");
    expect(parts).toHaveLength(4);
    const [scheme, params, saltB64, hashB64] = parts;
    expect(scheme).toBe("scrypt");
    expect(params).toBe("16384,8,1");
    // salt/hash 应该是能正常 base64 解码的非空内容
    expect(saltB64.length).toBeGreaterThan(0);
    expect(hashB64.length).toBeGreaterThan(0);
    expect(() => Buffer.from(saltB64, "base64")).not.toThrow();
    expect(() => Buffer.from(hashB64, "base64")).not.toThrow();
  });

  // 每次哈希都要用新随机 salt，否则同一密码的两条记录会在数据库里
  // 一眼看出"相同"，且更容易被彩虹表攻击。
  it("同一密码两次哈希产生不同字符串，但都能验证通过", async () => {
    const password = "same-password-twice";
    const stored1 = await hashPassword(password);
    const stored2 = await hashPassword(password);

    expect(stored1).not.toBe(stored2);
    expect(await verifyPassword(password, stored1)).toBe(true);
    expect(await verifyPassword(password, stored2)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("往返验证：正确密码通过", async () => {
    const password = "hunter2";
    const stored = await hashPassword(password);
    expect(await verifyPassword(password, stored)).toBe(true);
  });

  it("错误密码不通过", async () => {
    const stored = await hashPassword("right-password");
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("对密码字节严格敏感：大小写不同不通过", async () => {
    const stored = await hashPassword("Password123");
    expect(await verifyPassword("password123", stored)).toBe(false);
  });

  it("对密码字节严格敏感：多余的尾随空白不通过", async () => {
    const stored = await hashPassword("Password123");
    expect(await verifyPassword("Password123 ", stored)).toBe(false);
  });

  // 存储的哈希字符串可能来自损坏的数据库记录、迁移遗留数据，或恶意
  // 构造的输入——这里断言的安全性质是"解析失败一律返回 false"，
  // 而不是把异常抛给调用方（调用方大多是登录路由，没有 try/catch
  // 就会变成 500 甚至把内部错误信息带出去）。
  it("格式损坏的存储字符串返回 false 而不是抛出异常", async () => {
    const malformed = [
      "", // 空字符串
      "scrypt", // 只有 scheme，缺少其余三段
      "scrypt$16384,8,1$onlysalt", // 缺 hash 段
      "bcrypt$16384,8,1$c2FsdA==$aGFzaA==", // scheme 不是 scrypt
      "scrypt$16384,8,1$not-valid-base64!!!$aGFzaA==", // salt 含非法 base64 字符
      "scrypt$NaN,eight,one$c2FsdA==$aGFzaA==", // N/r/p 解析为 NaN
    ];

    for (const stored of malformed) {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    }
  });
});
