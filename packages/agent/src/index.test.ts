import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { toolSchemas } from ".";

test("共享入口可以独立打包到浏览器，工具契约保留默认值和输入限制", async () => {
  const build = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "index.ts")],
    target: "browser",
  });
  expect(build.success).toBe(true);
  expect(build.outputs).toHaveLength(1);
  expect(toolSchemas.readFile.inputSchema.parse({ path: "README.md" })).toEqual({
    path: "README.md",
    startLine: 1,
    limit: 200,
  });
  expect(toolSchemas.readFile.inputSchema.safeParse({ path: "../README.md" }).success).toBe(false);
  expect(
    toolSchemas.createFile.inputSchema.safeParse({
      path: "text.txt",
      content: "中".repeat(349_526),
    }).success,
  ).toBe(false);
});
