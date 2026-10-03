import { z } from "zod";
import { contentSchema, relativePathSchema } from "../shared";

export const editFileInput = z.object({
  path: relativePathSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  oldText: contentSchema.refine((value) => value.length > 0, "旧文本不能为空。"),
  newText: contentSchema,
});
export const editFileOutput = z.object({
  path: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const editFileDefinition = {
  description:
    "精确编辑已读取的文件；必须传入读取所得 SHA-256，旧文本必须恰好匹配一次，失败时不修改。",
  inputSchema: editFileInput,
  outputSchema: editFileOutput,
};
