import { expect, test } from "bun:test";
import { promptRouteStateSchema, promptSchema } from "./promptSchema";

test("提示词拒绝空白并返回规范化后的文本", () => {
  expect(promptSchema.safeParse(" \n\t ").success).toBe(false);
  expect(promptSchema.safeParse("  第一行\n第二行  ")).toMatchObject({
    success: true,
    data: "第一行\n第二行",
  });
});

test("聊天路由仅接受带有效提示词的状态", () => {
  expect(promptRouteStateSchema.safeParse(null).success).toBe(false);
  expect(promptRouteStateSchema.safeParse({ prompt: "  " }).success).toBe(false);
  expect(promptRouteStateSchema.safeParse({ prompt: " hello " })).toMatchObject({
    success: true,
    data: { prompt: "hello" },
  });
  expect(promptRouteStateSchema.safeParse({ prompt: "hello", mode: "unknown" }).success).toBe(
    false,
  );
  expect(promptRouteStateSchema.parse({ prompt: "hello", mode: "readOnly" }).mode).toBe("readOnly");
});
