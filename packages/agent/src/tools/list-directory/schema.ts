import { z } from "zod";
import { relativePathSchema } from "../shared";

export const listDirectoryInput = z.object({
  path: relativePathSchema.default("."),
  offset: z.int().min(0).default(0),
  limit: z.int().min(1).max(200).default(200),
});
export const listDirectoryOutput = z.object({
  entries: z.array(z.object({ name: z.string(), type: z.enum(["file", "directory", "symlink"]) })),
  total: z.int().min(0),
  truncated: z.boolean(),
});

export const listDirectoryDefinition = {
  description: "列出工作区相对目录中的文件和目录，按名称排序，可用 offset 分页。",
  inputSchema: listDirectoryInput,
  outputSchema: listDirectoryOutput,
};
