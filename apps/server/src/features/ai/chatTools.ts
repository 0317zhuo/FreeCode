import { tool } from "ai";
import { z } from "zod";

/** 真实执行整数加法，供模型调用并返回可展示的结构化结果。 */
export const chatTools = {
  addNumbers: tool({
    description: "计算两个整数的和。需要进行整数加法时调用此工具，每个整数范围为 -10 亿到 10 亿。",
    inputSchema: z.object({
      a: z.int().min(-1_000_000_000).max(1_000_000_000).describe("第一个整数"),
      b: z.int().min(-1_000_000_000).max(1_000_000_000).describe("第二个整数"),
    }),
    outputSchema: z.object({ result: z.int().min(-2_000_000_000).max(2_000_000_000) }),
    execute: async ({ a, b }) => ({ result: a + b }),
  }),
};
