import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 同一个 gotcha 出现在 lib/store/jsonStore.ts：DATA_DIR 是模块顶层的
// `path.resolve(...)` 常量，只在模块首次加载时读一次 process.env.DATA_DIR。
// lib/versions/store.ts 又通过 dataDir() 依赖它，所以每个测试都必须先设置
// 好环境变量、再 vi.resetModules()、再动态 import，顺序不能反——否则多个
// 测试会全部撞到同一份（第一次 import 时缓存下来的）DATA_DIR。
// WORKSPACE_DIR 没有这个问题（lib/files/service.ts 的 getWorkspaceRoot()
// 每次调用都现读 process.env），但为了和 DATA_DIR 保持一致的隔离习惯，
// 同样在每个测试里重新指向一个全新的临时目录。
let tmpDataDir: string;
let tmpWorkspaceDir: string;

beforeEach(() => {
  tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "guangli-versions-data-"));
  tmpWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "guangli-versions-ws-"));
  process.env.DATA_DIR = tmpDataDir;
  process.env.WORKSPACE_DIR = tmpWorkspaceDir;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDataDir, { recursive: true, force: true });
  fs.rmSync(tmpWorkspaceDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.WORKSPACE_DIR;
});

describe("snapshotFile + listVersions", () => {
  it("保存一次快照后，listVersions 恰好返回这一条记录，字段与内容都对得上", async () => {
    const { snapshotFile, listVersions, getVersionContent } = await import("@/lib/versions/store");

    const saved = await snapshotFile("data", "settings.json", '{"a":1}', "manual", true);
    const versions = await listVersions("data", "settings.json");

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: saved.id,
      kind: "data",
      relPath: "settings.json",
      reason: "manual",
      knownGood: true,
    });

    const content = await getVersionContent("data", "settings.json", saved.id);
    expect(content).toBe('{"a":1}');
  });
});

describe("排序：多次快照后新的排在最前面", () => {
  it("依次 await 三次 snapshotFile，versions[0] 是最后一次保存的内容", async () => {
    const { snapshotFile, listVersions } = await import("@/lib/versions/store");

    const first = await snapshotFile("workspace", "notes.md", "one", "edit");
    const second = await snapshotFile("workspace", "notes.md", "two", "edit");
    const third = await snapshotFile("workspace", "notes.md", "three", "edit");

    const versions = await listVersions("workspace", "notes.md");
    expect(versions.map((v) => v.id)).toEqual([third.id, second.id, first.id]);
  });
});

describe("超过上限时淘汰最旧的版本", () => {
  it("连续保存 25 个版本后只保留最近 20 个，且被淘汰版本的 .snapshot 文件从磁盘删除", async () => {
    const { snapshotFile, listVersions, getVersionContent } = await import("@/lib/versions/store");
    const { dataDir } = await import("@/lib/store/jsonStore");
    const { createHash } = await import("node:crypto");

    const saved: { id: string; content: string }[] = [];
    for (let i = 0; i < 25; i++) {
      const content = `v${i}`;
      const version = await snapshotFile("data", "big-history.json", content, "auto");
      saved.push({ id: version.id, content });
    }

    const versions = await listVersions("data", "big-history.json");
    expect(versions).toHaveLength(20);

    // 最近 20 次（v5..v24）应该都还在，且是新到旧的顺序；最早的 5 个（v0..v4）应该被淘汰。
    const expectedIds = saved
      .slice(5)
      .map((s) => s.id)
      .reverse();
    expect(versions.map((v) => v.id)).toEqual(expectedIds);

    for (const evicted of saved.slice(0, 5)) {
      expect(await getVersionContent("data", "big-history.json", evicted.id)).toBeNull();
    }

    // 直接检查版本目录下的文件列表——不应该有孤儿 .snapshot 文件残留。
    const keyHash = createHash("sha1").update("data:big-history.json").digest("hex").slice(0, 16);
    const dirFiles = fs.readdirSync(path.join(dataDir(), "versions", keyHash));
    const snapshotFiles = dirFiles.filter((f) => f.endsWith(".snapshot"));
    expect(snapshotFiles).toHaveLength(20);
    expect(dirFiles).toContain("index.json");
    expect(dirFiles).toHaveLength(21);

    for (const evicted of saved.slice(0, 5)) {
      expect(snapshotFiles).not.toContain(`${evicted.id}.snapshot`);
    }
  });
});

describe("并发写入同一个文件不会损坏 index.json", () => {
  it("并发触发 15 次 snapshotFile，index 仍然合法、条目数正确、id 互不重复", async () => {
    const { snapshotFile, listVersions, getVersionContent } = await import("@/lib/versions/store");

    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) => snapshotFile("workspace", "concurrent.md", `content-${i}`, "edit")),
    );

    const versions = await listVersions("workspace", "concurrent.md");
    expect(versions).toHaveLength(Math.min(15, 20));

    const ids = new Set(versions.map((v) => v.id));
    expect(ids.size).toBe(versions.length);

    // 每一次 snapshotFile 调用返回的 id 也应该都各不相同、且都能在最终列表里找到。
    const resultIds = new Set(results.map((r) => r.id));
    expect(resultIds.size).toBe(15);
    for (const id of resultIds) {
      expect(ids.has(id)).toBe(true);
    }

    for (const v of versions) {
      const content = await getVersionContent("workspace", "concurrent.md", v.id);
      expect(content).not.toBeNull();
      expect(typeof content).toBe("string");
    }
  });
});

describe("getLatestKnownGood", () => {
  it("先坏后好：返回最新的 knownGood 版本", async () => {
    const { snapshotFile, getLatestKnownGood } = await import("@/lib/versions/store");

    await snapshotFile("data", "settings.json", "not json", "auto", false);
    const good = await snapshotFile("data", "settings.json", '{"ok":true}', "auto", true);

    const result = await getLatestKnownGood("data", "settings.json");
    expect(result).not.toBeNull();
    expect(result?.version.id).toBe(good.id);
    expect(result?.content).toBe('{"ok":true}');
  });

  it("好-坏-好：即便最新一条是坏的，也应该跳过它、返回更早那条好的（而不是最新那条坏的）", async () => {
    const { snapshotFile, getLatestKnownGood } = await import("@/lib/versions/store");

    const firstGood = await snapshotFile("data", "settings.json", '{"v":1}', "auto", true);
    await snapshotFile("data", "settings.json", "broken", "auto", false);

    const result = await getLatestKnownGood("data", "settings.json");
    expect(result).not.toBeNull();
    expect(result?.version.id).toBe(firstGood.id);
    expect(result?.content).toBe('{"v":1}');
  });
});

describe("restoreVersion — kind: data", () => {
  it("恢复到指定版本后，磁盘上的文件内容变回该版本，并且恢复动作本身也被快照", async () => {
    const { snapshotFile, listVersions, restoreVersion } = await import("@/lib/versions/store");

    const target = path.join(tmpDataDir, "settings.json");
    fs.writeFileSync(target, '{"original":true}', "utf8");

    const original = await snapshotFile("data", "settings.json", '{"original":true}', "manual");

    // 快照之后，实际文件被改成了别的内容。
    fs.writeFileSync(target, '{"changed":true}', "utf8");

    await restoreVersion("data", "settings.json", original.id);

    const liveContent = fs.readFileSync(target, "utf8");
    expect(liveContent).toBe('{"original":true}');

    // restoreVersion 应该把"恢复前一刻"（也就是 changed 那份）先快照下来，
    // 所以版本数应该 +1，且新的 versions[0] 就是那份 changed 内容。
    const versions = await listVersions("data", "settings.json");
    expect(versions).toHaveLength(2);
    expect(versions[0].reason).toBe("auto");

    const { getVersionContent } = await import("@/lib/versions/store");
    const preRestoreContent = await getVersionContent("data", "settings.json", versions[0].id);
    expect(preRestoreContent).toBe('{"changed":true}');
  });
});

describe("restoreVersion — kind: workspace", () => {
  it("恢复到指定版本后，工作区下的文件内容变回该版本，并且恢复动作本身也被快照", async () => {
    const { snapshotFile, listVersions, restoreVersion, getVersionContent } = await import("@/lib/versions/store");

    const target = path.join(tmpWorkspaceDir, "notes.md");
    fs.writeFileSync(target, "original notes", "utf8");

    const original = await snapshotFile("workspace", "notes.md", "original notes", "manual");

    fs.writeFileSync(target, "changed notes", "utf8");

    await restoreVersion("workspace", "notes.md", original.id);

    const liveContent = fs.readFileSync(target, "utf8");
    expect(liveContent).toBe("original notes");

    const versions = await listVersions("workspace", "notes.md");
    expect(versions).toHaveLength(2);
    expect(versions[0].reason).toBe("auto");

    const preRestoreContent = await getVersionContent("workspace", "notes.md", versions[0].id);
    expect(preRestoreContent).toBe("changed notes");
  });
});

describe("restoreAllToPreviousVersion", () => {
  it("把每个被追踪的文件都恢复到它自己的上一个版本（workspace + data 混合）", async () => {
    const { snapshotFile, restoreAllToPreviousVersion } = await import("@/lib/versions/store");

    const notesPath = path.join(tmpWorkspaceDir, "notes.md");
    const settingsPath = path.join(tmpDataDir, "settings.json");
    const otherPath = path.join(tmpDataDir, "other.json");

    fs.writeFileSync(notesPath, "notes v1", "utf8");
    fs.writeFileSync(settingsPath, '{"n":1}', "utf8");
    fs.writeFileSync(otherPath, '{"m":2}', "utf8");

    // snapshotFile 记录的是"即将被覆盖之前"的内容，所以这里先快照旧内容，
    // 再把磁盘上的文件改成新内容——这正是 versions[0] 应该代表"写入前状态"的语义。
    await snapshotFile("workspace", "notes.md", "notes v1", "edit");
    await snapshotFile("data", "settings.json", '{"n":1}', "edit");
    await snapshotFile("data", "other.json", '{"m":2}', "edit");

    fs.writeFileSync(notesPath, "notes v2", "utf8");
    fs.writeFileSync(settingsPath, '{"n":2}', "utf8");
    fs.writeFileSync(otherPath, '{"m":3}', "utf8");

    const result = await restoreAllToPreviousVersion();

    expect(result.failed).toEqual([]);
    expect(result.restored.sort()).toEqual(["notes.md", "other.json", "settings.json"].sort());

    expect(fs.readFileSync(notesPath, "utf8")).toBe("notes v1");
    expect(fs.readFileSync(settingsPath, "utf8")).toBe('{"n":1}');
    expect(fs.readFileSync(otherPath, "utf8")).toBe('{"m":2}');
  });
});

describe("从未快照过的文件", () => {
  it("listVersions 返回空数组，getVersionContent 返回 null，都不抛错", async () => {
    const { listVersions, getVersionContent, getLatestKnownGood } = await import("@/lib/versions/store");

    expect(await listVersions("data", "never-touched.json")).toEqual([]);
    expect(await getVersionContent("data", "never-touched.json", "whatever-id")).toBeNull();
    expect(await getLatestKnownGood("workspace", "never-touched.md")).toBeNull();
  });
});
