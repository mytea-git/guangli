import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// jsonStore.ts 在模块顶层就把 DATA_DIR 解析成一个常量（而不是每次调用时
// 才读环境变量），所以每个用例都必须先设置好 process.env.DATA_DIR、再
// vi.resetModules() 强制它在下一次动态 import 时重新求值，最后再动态
// import 这个模块——绝不能在文件顶层静态 import，否则会在任何 beforeEach
// 跑之前就把 DATA_DIR 锁定成真实的 cwd/data 目录，污染仓库里的真实数据。
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "guangli-jsonstore-"));
  process.env.DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("jsonStore", () => {
  it("dataDir() 反映的是当前 DATA_DIR 环境变量指向的临时目录，而不是真实的 ./data", async () => {
    const { dataDir } = await import("@/lib/store/jsonStore");
    expect(dataDir()).toBe(path.resolve(tmpDir));
  });

  it("readJson: 文件不存在（ENOENT）时返回调用方传入的回退值", async () => {
    const { readJson } = await import("@/lib/store/jsonStore");
    const fallback = { hello: "world" };
    const result = await readJson(`test-${randomUUID()}.json`, fallback);
    expect(result).toEqual(fallback);
  });

  it("writeJson 之后 readJson 能把任意 JSON 可序列化对象原样读回来", async () => {
    const { readJson, writeJson } = await import("@/lib/store/jsonStore");
    const name = `test-${randomUUID()}.json`;
    const data = { a: 1, b: "文本", c: [1, 2, 3], d: { nested: true }, e: null as string | null };

    await writeJson(name, data);
    const result = await readJson(name, null);

    expect(result).toEqual(data);
  });

  it("writeJson 走临时文件+rename 原子写入：完成后目录里只剩目标文件，没有残留的 .tmp 文件", async () => {
    const { writeJson, dataDir } = await import("@/lib/store/jsonStore");
    const name = `test-${randomUUID()}.json`;

    await writeJson(name, { ok: true });

    const entries = fs.readdirSync(dataDir());
    expect(entries).toEqual([name]);
    expect(entries.some((f) => f.endsWith(".tmp"))).toBe(false);

    const raw = fs.readFileSync(path.join(dataDir(), name), "utf8");
    expect(JSON.parse(raw)).toEqual({ ok: true });
  });

  it("readJson 在磁盘文件损坏时，会自动从最近一个已知完好（knownGood）的版本快照中恢复", async () => {
    // 同一次 resetModules 之后一起动态 import 两个模块，确保它们看到的是
    // 同一份基于新 DATA_DIR 求值出的 dataDir()——避免两个模块实例互相
    // 看到不一致的 DATA_DIR。
    const { readJson, writeJson, dataDir } = await import("@/lib/store/jsonStore");
    await import("@/lib/versions/store");

    const name = `test-${randomUUID()}.json`;

    // 第一次写入时文件还不存在，snapshot 选项没有旧内容可快照。
    await writeJson(name, { value: "first" }, { snapshot: true });
    // 第二次写入前，磁盘上是第一次写入的结果——这次会把 {value:"first"}
    // 快照下来，标记为 knownGood（它能被 JSON.parse 成功）。
    await writeJson(name, { value: "second" }, { snapshot: true });

    // 直接绕开 jsonStore，在磁盘上把文件改成非法 JSON，模拟损坏/半截写入。
    fs.writeFileSync(path.join(dataDir(), name), "{not valid json", "utf8");

    const recovered = await readJson(name, { value: "fallback" });

    // 应当恢复出"第二次写入之前"的已知完好内容，而不是掉回 fallback。
    expect(recovered).toEqual({ value: "first" });
  });

  it("updateJson 把并发调用串行化为一个个原子的读-改-写，不会丢更新", async () => {
    const { updateJson, readJson } = await import("@/lib/store/jsonStore");
    const name = `test-${randomUUID()}.json`;
    const N = 20;

    // 20 个并发的 +1 操作。如果 updateJson 是天真的"先 readJson 再单独
    // writeJson"（两次分别入队），中间会被其它并发调用插队，最终计数会
    // 小于 N；updateJson 把读-改-写合并进同一个入队任务，因此必须精确等于 N。
    await Promise.all(
      Array.from({ length: N }, () =>
        updateJson(name, { count: 0 }, (current: { count?: number }) => ({
          count: (current.count ?? 0) + 1,
        })),
      ),
    );

    const final = await readJson(name, { count: 0 });
    expect(final.count).toBe(N);
  });

  it("writeJsonText 写入的是已经序列化好的原始 JSON 文本，读回时与传入内容逐字节一致", async () => {
    const { writeJsonText, dataDir } = await import("@/lib/store/jsonStore");
    const name = `test-${randomUUID()}.json`;
    // 故意带着"奇怪"的空白/格式，用来验证 writeJsonText 不会重新
    // JSON.stringify 一遍、把格式规整掉。
    const text = '{\n  "raw" :   true ,\n"weird_spacing":1\n}\n';

    await writeJsonText(name, text);

    const raw = fs.readFileSync(path.join(dataDir(), name), "utf8");
    expect(raw).toBe(text);
  });

  it("redactForSnapshot 只脱敏写入版本历史的快照副本，磁盘上的实际内容保持不变", async () => {
    const { readJson, writeJson } = await import("@/lib/store/jsonStore");
    const { listVersions, getVersionContent } = await import("@/lib/versions/store");
    const name = `test-${randomUUID()}.json`;

    // 首次写入：文件尚不存在，即使这里不开 snapshot 也没有旧内容可快照，
    // 只是单纯地把初始内容落盘，供下一次写入时被快照到。
    await writeJson(name, { secret: "plaintext-key" });

    // 第二次写入触发"写入前快照"：快照的是上一步写入的旧内容，
    // redactForSnapshot 把其中的明文密钥替换成占位符，但只影响进入版本
    // 历史的这一份副本，磁盘上真正写入的新内容不受影响。
    await writeJson(
      name,
      { secret: "plaintext-key" },
      {
        snapshot: true,
        redactForSnapshot: (raw) => raw.replace("plaintext-key", "REDACTED"),
      },
    );

    const versions = await listVersions("data", name);
    expect(versions.length).toBeGreaterThan(0);

    const snapshotContent = await getVersionContent("data", name, versions[0].id);
    expect(snapshotContent).not.toBeNull();
    expect(snapshotContent as string).toContain("REDACTED");
    expect(snapshotContent as string).not.toContain("plaintext-key");

    const live = await readJson<{ secret: string }>(name, { secret: "" });
    expect(live.secret).toBe("plaintext-key");
  });
});
