import { z } from "zod";
import { relativePathSchema } from "../shared";

export const searchFilesInput = z.object({
  path: relativePathSchema.default("."),
  query: z.string().min(1).max(1000),
});
export const searchFilesOutput = z.object({
  matches: z.array(z.object({ path: z.string(), line: z.int().min(1), text: z.string() })),
  truncated: z.boolean(),
});

export const searchFilesDefinition = {
  description:
    "递归搜索工作区 UTF-8 文件中的字面量，区分大小写，跳过 .git、node_modules 和符号链接，最多 100 条。",
  inputSchema: searchFilesInput,
  outputSchema: searchFilesOutput,
};
