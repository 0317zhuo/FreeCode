import { expect, test } from "bun:test";
import { agentModes } from "@freecode/contracts";
import { MockLanguageModelV4 } from "ai/test";
import { modeDefinitions } from "./modes";
import { createCodingAgent } from "./server";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

test.each(["build", "readOnly"] as const)(
  "%s 模式注入独立提示词且只提供白名单工具",
  async (mode) => {
    let executions = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content:
          executions === 0
            ? [
                {
                  type: "tool-call",
                  toolCallId: "read",
                  toolName: "readFile",
                  input: JSON.stringify({ path: "README.md" }),
                },
              ]
            : [{ type: "text", text: "读取完成。" }],
        finishReason: { unified: executions === 0 ? "tool-calls" : "stop", raw: undefined },
        usage,
        warnings: [],
      }),
    });
    const { agent, tools } = createCodingAgent(
      model,
      {
        async execute(name) {
          expect(name).toBe("readFile");
          executions++;
          return { text: "1: 内容", hash: "a".repeat(64), totalLines: 1, truncated: false };
        },
      },
      mode,
    );
    const result = await agent.generate({ prompt: "读取项目" });
    expect(result.text).toBe("读取完成。");
    expect(executions).toBe(1);
    expect(Object.keys(tools)).toEqual([...modeDefinitions[mode].tools]);
    for (const call of model.doGenerateCalls) {
      expect(call.tools?.map((tool) => tool.name).sort()).toEqual(
        [...modeDefinitions[mode].tools].sort(),
      );
      const instructions = call.prompt.find((message) => message.role === "system")?.content;
      expect(instructions).toContain(modeDefinitions[mode].instructions);
      expect(instructions).toContain(`当前请求模式：${agentModes[mode].name}（${mode}）`);
      // 声明必须与实际发送给模型的工具一致，不独立维护另一份清单。
      const declaredTools = String(instructions)
        .match(/本轮可用工具：([^。]+)。/)?.[1]
        ?.split("、");
      expect(declaredTools?.sort()).toEqual(call.tools?.map((tool) => tool.name).sort());
      expect(instructions).toContain("历史回答中的模式和工具能力描述仅代表当时状态");
      if (mode === "readOnly") {
        for (const name of ["createFile", "editFile", "bash"])
          expect(instructions).not.toContain(name);
      }
    }
  },
);

test.each([
  ["createFile", { path: "new.txt", content: "内容" }],
  ["editFile", { path: "README.md", hash: "a".repeat(64), oldText: "旧内容", newText: "新内容" }],
  ["bash", { command: "touch new.txt" }],
] as const)("只读模式拒绝模型主动返回的 %s 调用", async (toolName, input) => {
  let calls = 0;
  let executions = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content:
        calls++ === 0
          ? [{ type: "tool-call", toolCallId: "denied", toolName, input: JSON.stringify(input) }]
          : [{ type: "text", text: "需要切换构建模式。" }],
      finishReason: { unified: calls === 1 ? "tool-calls" : "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });
  const { agent } = createCodingAgent(
    model,
    {
      async execute() {
        executions++;
        throw new Error("禁止执行");
      },
    },
    "readOnly",
  );
  await agent.generate({ prompt: "尝试修改文件" });
  expect(executions).toBe(0);
  expect(model.doGenerateCalls[0]?.tools?.map((tool) => tool.name)).not.toContain(toolName);
});

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
