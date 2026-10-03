import { z } from "zod";
import { relativePathSchema } from "../shared";

export const readFileInput = z.object({
  path: relativePathSchema,
  startLine: z.int().min(1).default(1),
  limit: z.int().min(1).max(500).default(200),
});
export const readFileOutput = z.object({
  text: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  totalLines: z.int().min(0),
  truncated: z.boolean(),
});

export const readFileDefinition = {
  description: "读取不超过 1 MiB 的 UTF-8 文本，返回带行号内容和完整文件 SHA-256；编辑前先读取。",
  inputSchema: readFileInput,
  outputSchema: readFileOutput,
};
