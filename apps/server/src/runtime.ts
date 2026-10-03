import type { Sandbox } from "@freecode/agent/sandbox";
import { type CodingAgent, createCodingAgent } from "@freecode/agent/server";
import { type AgentMode, agentModeSchema } from "@freecode/contracts";
import { createDeepSeekProvider } from "./providers/deepseek";

/** 应用运行时持有鉴权与供应商配置，Agent 包只持有执行能力。 */
export function createServerRuntime(workspaceRoot: string, token: string, sandbox: Sandbox) {
  const provider = createDeepSeekProvider();
  const agents = Object.fromEntries(
    agentModeSchema.options.map((mode) => [mode, createCodingAgent(provider.model, sandbox, mode)]),
  ) as Record<AgentMode, CodingAgent>;
  return { workspaceRoot, token, provider, agents };
}

export type ServerRuntime = ReturnType<typeof createServerRuntime>;
export type ServerEnv = { Bindings: { runtime: ServerRuntime } };
