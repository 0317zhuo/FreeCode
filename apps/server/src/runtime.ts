import type { Sandbox } from "@freecode/agent/sandbox";
import { createCodingAgent } from "@freecode/agent/server";
import { createDeepSeekProvider } from "./providers/deepseek";

/** 应用运行时持有鉴权与供应商配置，Agent 包只持有执行能力。 */
export function createServerRuntime(workspaceRoot: string, token: string, sandbox: Sandbox) {
  const provider = createDeepSeekProvider();
  return { workspaceRoot, token, provider, ...createCodingAgent(provider.model, sandbox) };
}

export type ServerRuntime = ReturnType<typeof createServerRuntime>;
export type ServerEnv = { Bindings: { runtime: ServerRuntime } };
