import { type AgentMode, agentModes, defaultAgentMode } from "@freecode/contracts";
import { type InferAgentUIMessage, isStepCount, type LanguageModel, ToolLoopAgent, tool } from "ai";
import { modeDefinitions } from "./modes";
import type { Sandbox } from "./sandbox/interface";
import { toolSchemas } from "./tools/schemas";

export function createCodingTools<M extends AgentMode = typeof defaultAgentMode>(
  sandbox: Sandbox,
  mode: M = defaultAgentMode as M,
) {
  const tools = {
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
  return Object.fromEntries(modeDefinitions[mode].tools.map((name) => [name, tools[name]])) as Pick<
    typeof tools,
    (typeof modeDefinitions)[M]["tools"][number]
  >;
}

const maxSteps = 20;

/** 模型由调用方提供；本包不读取应用配置，也不管理鉴权或数据库。 */
export function createCodingAgent(
  model: LanguageModel,
  sandbox: Sandbox,
  mode: AgentMode = defaultAgentMode,
) {
  const tools = createCodingTools(sandbox, mode);
  const agent = new ToolLoopAgent({
    model,
    reasoning: "high",
    // 错误由服务端流入口脱敏记录，避免 SDK 默认日志包含请求内容。
    prepareCall: (settings) => ({ ...settings, onError: () => {} }),
    tools,
    instructions: `${modeDefinitions[mode].instructions}

当前请求模式：${agentModes[mode].name}（${mode}）
本轮可用工具：${Object.keys(tools).join("、")}。`,
    stopWhen: isStepCount(maxSteps),
    prepareStep: ({ stepNumber }) =>
      stepNumber === maxSteps - 1 ? { toolChoice: "none" } : undefined,
  });
  return { tools, agent };
}

export type CodingAgent = ReturnType<typeof createCodingAgent>;
export type CodingUIMessage = InferAgentUIMessage<CodingAgent["agent"]>;
