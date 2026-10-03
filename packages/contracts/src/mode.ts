import { z } from "zod";

/** 展示顺序也是 Tab 的循环顺序；新增模式在此注册标识与名称。 */
export const agentModes = {
  build: { name: "构建" },
  readOnly: { name: "只读" },
} as const;

export const agentModeSchema = z.enum(
  Object.keys(agentModes) as [keyof typeof agentModes, ...Array<keyof typeof agentModes>],
);
export type AgentMode = z.infer<typeof agentModeSchema>;
export const defaultAgentMode = "build" satisfies AgentMode;
