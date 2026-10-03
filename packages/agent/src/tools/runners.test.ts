import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { link, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectWorkspace, resolveWorkspacePath } from "../sandbox/workspace";
import { createCodingTools } from "../server";
import { executeTool } from "./runners";
import { maxFileBytes } from "./shared";

const roots: string[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "freecode-files-")));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("创建、读取行范围、分页、搜索与编辑只修改目标", async () => {
  const root = await fixture();
  await executeTool(root, "createFile", {
    path: "src/code.ts",
    content: "第一行\nvalue = 1;\n最后一行",
  });
  await executeTool(root, "createFile", { path: "other.txt", content: "保持不变" });
  await executeTool(root, "createFile", { path: "empty.txt", content: "" });
  expect(await executeTool(root, "listDirectory", { limit: 1 })).toMatchObject({
    entries: [{ name: "empty.txt", type: "file" }],
    total: 3,
    truncated: true,
  });
  expect(await executeTool(root, "listDirectory", { offset: 2 })).toMatchObject({
    entries: [{ name: "src", type: "directory" }],
    truncated: false,
  });
  expect(await executeTool(root, "readFile", { path: "empty.txt" })).toMatchObject({
    text: "",
    totalLines: 0,
  });
  const before = await executeTool(root, "readFile", {
    path: "src/code.ts",
    startLine: 2,
    limit: 1,
  });
  expect(before).toEqual({
    text: "2: value = 1;",
    hash: hash("第一行\nvalue = 1;\n最后一行"),
    totalLines: 3,
    truncated: true,
  });
  expect(await executeTool(root, "searchFiles", { query: "value =" })).toEqual({
    matches: [{ path: "src/code.ts", line: 2, text: "value = 1;" }],
    truncated: false,
  });
  expect(await executeTool(root, "searchFiles", { query: "不存在" })).toEqual({
    matches: [],
    truncated: false,
  });
  await executeTool(root, "editFile", {
    path: "src/code.ts",
    hash: hash("第一行\nvalue = 1;\n最后一行"),
    oldText: "value = 1;",
    newText: "value = 2;",
  });
  expect(await Bun.file(join(root, "src/code.ts")).text()).toBe("第一行\nvalue = 2;\n最后一行");
  expect(await Bun.file(join(root, "other.txt")).text()).toBe("保持不变");
  await expect(
    executeTool(root, "createFile", { path: "src/code.ts", content: "覆盖" }),
  ).rejects.toThrow();
});

test("编辑拒绝过期哈希、不存在和重复的旧文本，不留下修改", async () => {
  const root = await fixture();
  const text = "same same";
  await Bun.write(join(root, "code.ts"), text);
  for (const input of [
    { hash: "a".repeat(64), oldText: "same", newText: "new" },
    { hash: hash(text), oldText: "missing", newText: "new" },
    { hash: hash(text), oldText: "same", newText: "new" },
    { hash: hash(text), oldText: "", newText: "new" },
  ])
    await expect(executeTool(root, "editFile", { path: "code.ts", ...input })).rejects.toThrow();
  expect(await Bun.file(join(root, "code.ts")).text()).toBe(text);
});

test("路径越界与符号链接防护，包括创建时的父目录", async () => {
  const root = await fixture();
  const outside = await fixture();
  await Bun.write(join(outside, "sentinel"), "目录外");
  await symlink(outside, join(root, "escape"));
  for (const path of [
    "../sentinel",
    "/etc/passwd",
    "a/../../sentinel",
    "bad\0path",
    "escape/sentinel",
  ]) {
    await expect(executeTool(root, "readFile", { path })).rejects.toThrow();
    await expect(executeTool(root, "createFile", { path, content: "禁止写入" })).rejects.toThrow();
  }
  await expect(
    executeTool(root, "createFile", { path: "escape/new/file", content: "越界" }),
  ).rejects.toThrow();
  expect(await Bun.file(join(outside, "sentinel")).text()).toBe("目录外");
  expect(await Bun.file(join(outside, "new/file")).exists()).toBe(false);
  await Bun.write(join(root, "target"), "目录内");
  await symlink("target", join(root, "internal"));
  expect(await executeTool(root, "readFile", { path: "internal" })).toMatchObject({
    text: "1: 目录内",
  });
  await expect(resolveWorkspacePath(root, "/workspace/file")).rejects.toThrow();
});

test("拒绝二进制、非法 UTF-8、超大文件和多重硬链接", async () => {
  const root = await fixture();
  for (const [name, data] of [
    ["binary", new Uint8Array([0, 1])],
    ["invalid", new Uint8Array([255])],
    ["large", new Uint8Array(maxFileBytes + 1).fill(65)],
  ] as const) {
    await Bun.write(join(root, name), data);
    await expect(executeTool(root, "readFile", { path: name })).rejects.toThrow();
  }
  expect(await executeTool(root, "searchFiles", { query: "A" })).toEqual({
    matches: [],
    truncated: false,
  });
  await Bun.write(join(root, "original"), "linked");
  await link(join(root, "original"), join(root, "alias"));
  await expect(inspectWorkspace(root)).rejects.toThrow("硬链接");
  await expect(executeTool(root, "readFile", { path: "alias" })).rejects.toThrow("硬链接");
});

test("搜索跳过依赖与 Git，匹配和大行输出有界", async () => {
  const root = await fixture();
  await executeTool(root, "createFile", {
    path: "node_modules/package/file",
    content: "needle",
  });
  await executeTool(root, "createFile", { path: ".git/file", content: "needle" });
  await Bun.write(join(root, "many.txt"), "needle\n".repeat(102));
  const result = await executeTool(root, "searchFiles", { query: "needle" });
  expect((result as { matches: unknown[] }).matches).toHaveLength(100);
  expect(result).toMatchObject({
    matches: expect.arrayContaining([{ path: "many.txt", line: 1, text: "needle" }]),
    truncated: true,
  });
  await Bun.write(join(root, "long.txt"), "中".repeat(40_000));
  const read = (await executeTool(root, "readFile", { path: "long.txt" })) as {
    text: string;
    truncated: boolean;
  };
  expect(Buffer.byteLength(read.text)).toBeLessThanOrEqual(65_536);
  expect(read.truncated).toBe(true);
});

test("AI SDK 工具显式注册并校验 schema，取消信号交给执行器", async () => {
  let received: AbortSignal | undefined;
  const tools = createCodingTools({
    async execute(_name, _input, signal) {
      received = signal;
      return { entries: [], total: 0, truncated: false };
    },
  });
  expect(Object.keys(tools)).toEqual([
    "listDirectory",
    "readFile",
    "searchFiles",
    "createFile",
    "editFile",
    "bash",
  ]);
  const controller = new AbortController();
  await tools.listDirectory.execute?.(
    { path: ".", offset: 0, limit: 200 },
    { toolCallId: "test", messages: [], abortSignal: controller.signal, context: {} },
  );
  expect(received).toBe(controller.signal);
});
