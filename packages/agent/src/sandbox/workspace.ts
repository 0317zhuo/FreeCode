import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { relativePathSchema } from "../tools/shared";

export function isWithin(root: string, path: string) {
  const value = relative(root, path);
  return value === "" || (!isAbsolute(value) && value !== ".." && !value.startsWith(`..${sep}`));
}

/** 容器中的路径检查；创建文件时逐级检查已有父目录。 */
export async function resolveWorkspacePath(root: string, input: string) {
  const path = resolve(root, relativePathSchema.parse(input));
  if (!isWithin(root, path)) throw new Error("路径超出工作区。");
  let current = root;
  for (const segment of relative(root, path).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        const target = await realpath(current);
        if (!isWithin(root, target)) throw new Error("符号链接超出工作区。");
      } else if (!stat.isFile() && !stat.isDirectory()) {
        throw new Error("不能访问特殊文件或 socket。");
      } else if (stat.isFile() && stat.nlink > 1) {
        throw new Error("不能访问多重硬链接文件。");
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      break;
    }
  }
  return path;
}

/** 不跟随符号链接，避免挂载前扫描读到工作区之外。 */
export async function inspectWorkspace(root: string, signal?: AbortSignal) {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error("工作区必须是目录。");
  async function visit(directory: string) {
    signal?.throwIfAborted();
    for (const name of await readdir(directory)) {
      signal?.throwIfAborted();
      const path = resolve(directory, name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (stat.dev !== rootStat.dev) throw new Error("工作区不能包含嵌套文件系统挂载。");
        await visit(path);
      } else if (!stat.isFile() || stat.nlink > 1) {
        throw new Error(`工作区包含特殊文件、socket 或多重硬链接：${relative(root, path)}`);
      }
    }
  }
  await visit(root);
}
