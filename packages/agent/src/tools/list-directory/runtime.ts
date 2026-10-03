import { lstat, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { existingPath } from "../runtime";
import { listDirectoryInput } from "./schema";

export async function runListDirectory(root: string, raw: unknown) {
  const input = listDirectoryInput.parse(raw);
  const path = await existingPath(root, input.path);
  const names = (await readdir(path)).sort();
  const entries = await Promise.all(
    names.slice(input.offset, input.offset + input.limit).map(async (name) => {
      const stat = await lstat(resolve(path, name));
      if (!stat.isSymbolicLink() && !stat.isFile() && !stat.isDirectory())
        throw new Error("目录包含特殊文件。");
      return {
        name,
        type: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file",
      };
    }),
  );
  return {
    entries,
    total: names.length,
    truncated: input.offset + entries.length < names.length,
  };
}
