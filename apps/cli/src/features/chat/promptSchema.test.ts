import { expect, test } from "bun:test";
import { chatPromptSchema, chatRouteStateSchema } from "./promptSchema";

test("提示词拒绝空白并返回规范化后的文本", () => {
  expect(chatPromptSchema.safeParse(" \n\t ").success).toBe(false);
  expect(chatPromptSchema.safeParse("  第一行\n第二行  ")).toMatchObject({
    success: true,
    data: "第一行\n第二行",
  });
});

test("聊天路由仅接受带有效提示词的状态", () => {
  expect(chatRouteStateSchema.safeParse(null).success).toBe(false);
  expect(chatRouteStateSchema.safeParse({ prompt: "  " }).success).toBe(false);
  expect(chatRouteStateSchema.safeParse({ prompt: " hello " })).toMatchObject({
    success: true,
    data: { prompt: "hello" },
  });
});
