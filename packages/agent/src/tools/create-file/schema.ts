import { z } from "zod";
import { contentSchema, relativePathSchema } from "../shared";

export const createFileInput = z.object({ path: relativePathSchema, content: contentSchema });
export const createFileOutput = z.object({
  path: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const createFileDefinition = {
  description: "在工作区创建 UTF-8 文件及必要父目录，已有文件时拒绝覆盖。",
  inputSchema: createFileInput,
  outputSchema: createFileOutput,
};
