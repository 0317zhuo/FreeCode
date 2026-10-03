import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { existingPath, hash, readText } from "../runtime";
import { maxFileBytes } from "../shared";
import { editFileInput } from "./schema";

export async function runEditFile(root: string, raw: unknown) {
  const input = editFileInput.parse(raw);
  const path = await existingPath(root, input.path);
  const text = await readText(path);
  if (hash(text) !== input.hash) throw new Error("文件已变化，请重新读取后编辑。");
  const start = text.indexOf(input.oldText);
  if (start < 0 || text.indexOf(input.oldText, start + 1) >= 0)
    throw new Error("旧文本必须恰好匹配一次。");
  const next = text.slice(0, start) + input.newText + text.slice(start + input.oldText.length);
  if (Buffer.byteLength(next) > maxFileBytes) throw new Error("编辑结果超过 1 MiB。");
  const file = await open(path, constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink > 1) throw new Error("不是普通文件或存在多重硬链接。");
    if (hash(await readText(path)) !== input.hash)
      throw new Error("文件已变化，请重新读取后编辑。");
    await file.writeFile(next, "utf8");
    await file.truncate(Buffer.byteLength(next));
  } finally {
    await file.close();
  }
  return { path: input.path, hash: hash(next) };
}
