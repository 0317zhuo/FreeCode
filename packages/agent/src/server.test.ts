import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { createCodingAgent } from "./server";

test("注入的模型连续调用工具，第 20 步关闭工具并总结", async () => {
  let executions = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async ({ toolChoice }) => {
      const summarizing = toolChoice?.type === "none";
      return {
        content: summarizing
          ? [{ type: "text", text: "已读取并总结。" }]
          : [
              {
                type: "tool-call",
                toolCallId: crypto.randomUUID(),
                toolName: "readFile",
                input: JSON.stringify({ path: "README.md" }),
              },
            ],
        finishReason: { unified: summarizing ? "stop" : "tool-calls", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  const { agent } = createCodingAgent(model, {
    async execute(name) {
      expect(name).toBe("readFile");
      executions++;
      return { text: "1: 内容", hash: "a".repeat(64), totalLines: 1, truncated: false };
    },
  });
  const result = await agent.generate({ prompt: "读取并总结项目。" });
  expect(model.doGenerateCalls).toHaveLength(20);
  expect(executions).toBe(19);
  expect(result.text).toBe("已读取并总结。");
  expect(result.finishReason).toBe("stop");
});
