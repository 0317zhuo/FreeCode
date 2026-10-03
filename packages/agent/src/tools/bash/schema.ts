import { z } from "zod";
import { relativePathSchema } from "../shared";

export const bashInput = z.object({
  command: z
    .string()
    .min(1)
    .max(65_536)
    .refine((value) => !value.includes("\0")),
  cwd: relativePathSchema.default("."),
  timeoutMs: z.int().min(1).max(60_000).default(30_000),
});
export const bashOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.int(),
  truncated: z.boolean(),
  timedOut: z.boolean(),
});

export const bashDefinition = {
  description:
    "在隔离容器中执行真实 Bash，支持管道、重定向和 Bun。禁止网络，不继承宿主环境；命令失败或取消不回滚文件改动。",
  inputSchema: bashInput,
  outputSchema: bashOutput,
};
