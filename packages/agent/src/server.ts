import { type InferAgentUIMessage, isStepCount, type LanguageModel, ToolLoopAgent, tool } from "ai";
import { systemInstructions } from "./instructions";
import type { Sandbox } from "./sandbox/interface";
import { toolSchemas } from "./tools/schemas";

export function createCodingTools(sandbox: Sandbox) {
  return {
    listDirectory: tool({
      ...toolSchemas.listDirectory,
      execute: async (input, { abortSignal }) =>
        toolSchemas.listDirectory.outputSchema.parse(
          await sandbox.execute("listDirectory", input, abortSignal),
        ),
    }),
    readFile: tool({
      ...toolSchemas.readFile,
      execute: async (input, { abortSignal }) =>
        toolSchemas.readFile.outputSchema.parse(
          await sandbox.execute("readFile", input, abortSignal),
        ),
    }),
    searchFiles: tool({
      ...toolSchemas.searchFiles,
      execute: async (input, { abortSignal }) =>
        toolSchemas.searchFiles.outputSchema.parse(
          await sandbox.execute("searchFiles", input, abortSignal),
        ),
    }),
    createFile: tool({
      ...toolSchemas.createFile,
      execute: async (input, { abortSignal }) =>
        toolSchemas.createFile.outputSchema.parse(
          await sandbox.execute("createFile", input, abortSignal),
        ),
    }),
    editFile: tool({
      ...toolSchemas.editFile,
      execute: async (input, { abortSignal }) =>
        toolSchemas.editFile.outputSchema.parse(
          await sandbox.execute("editFile", input, abortSignal),
        ),
    }),
    bash: tool({
      ...toolSchemas.bash,
      execute: async (input, { abortSignal }) =>
        toolSchemas.bash.outputSchema.parse(await sandbox.execute("bash", input, abortSignal)),
    }),
  };
}

const maxSteps = 20;

/** 模型由调用方提供；本包不读取应用配置，也不管理鉴权或数据库。 */
export function createCodingAgent(model: LanguageModel, sandbox: Sandbox) {
  const tools = createCodingTools(sandbox);
  const agent = new ToolLoopAgent({
    model,
    reasoning: "high",
    // 错误由服务端流入口脱敏记录，避免 SDK 默认日志包含请求内容。
    prepareCall: (settings) => ({ ...settings, onError: () => {} }),
    tools,
    instructions: systemInstructions,
    stopWhen: isStepCount(maxSteps),
    prepareStep: ({ stepNumber }) =>
      stepNumber === maxSteps - 1 ? { toolChoice: "none" } : undefined,
  });
  return { tools, agent };
}

export type CodingAgent = ReturnType<typeof createCodingAgent>;
export type CodingUIMessage = InferAgentUIMessage<CodingAgent["agent"]>;
