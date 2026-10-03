import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { resolveWorkspacePath } from "../sandbox/workspace";
import { maxFileBytes, maxOutputBytes } from "./shared";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export class UnsupportedTextFile extends Error {}

export async function readText(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink > 1) throw new Error("不是普通文件或存在多重硬链接。");
    if (stat.size > maxFileBytes) throw new UnsupportedTextFile("文件超过 1 MiB。");
    // 有界读取，防止读取期间文件增大导致无界内存分配。
    const buffer = Buffer.alloc(maxFileBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const result = await file.read(buffer, size, buffer.length - size);
      if (result.bytesRead === 0) break;
      size += result.bytesRead;
    }
    if (size > maxFileBytes) throw new UnsupportedTextFile("文件超过 1 MiB。");
    const bytes = buffer.subarray(0, size);
    if (bytes.includes(0)) throw new UnsupportedTextFile("不支持二进制文件。");
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new UnsupportedTextFile("文件不是有效的 UTF-8 文本。");
    }
  } finally {
    await file.close();
  }
}

export function capText(text: string, budget = maxOutputBytes) {
  const bytes = Buffer.from(text);
  return {
    text:
      bytes.length <= budget
        ? text
        : new TextDecoder().decode(bytes.subarray(0, budget), { stream: true }),
    truncated: bytes.length > budget,
  };
}

export async function existingPath(root: string, path: string) {
  const checked = await resolveWorkspacePath(root, path);
  return realpath(checked);
}
