import { z } from "zod";

export const maxFileBytes = 1_048_576;
export const maxOutputBytes = 65_536;
export const relativePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) => !path.startsWith("/") && !path.includes("\0") && !path.split(/[\\/]/).includes(".."),
    "路径必须相对工作区，不能包含 .. 或 NUL。",
  );
export const contentSchema = z
  .string()
  .refine(
    (text) => new TextEncoder().encode(text).byteLength <= maxFileBytes,
    "文本不能超过 1 MiB。",
  );
