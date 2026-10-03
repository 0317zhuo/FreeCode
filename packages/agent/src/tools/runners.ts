import { runBash } from "./bash/runtime";
import { runCreateFile } from "./create-file/runtime";
import { runEditFile } from "./edit-file/runtime";
import { runListDirectory } from "./list-directory/runtime";
import { runReadFile } from "./read-file/runtime";
import type { CodingToolName } from "./schemas";
import { runSearchFiles } from "./search-files/runtime";

/** 只供容器入口和临时目录测试调用，SDK 工具通过 Sandbox 委托执行。 */
export const toolRunners = {
  listDirectory: runListDirectory,
  readFile: runReadFile,
  searchFiles: runSearchFiles,
  createFile: runCreateFile,
  editFile: runEditFile,
  bash: runBash,
} satisfies Record<CodingToolName, (root: string, input: unknown) => Promise<unknown>>;

export async function executeTool(root: string, name: string, input: unknown) {
  if (!Object.hasOwn(toolRunners, name)) throw new Error("未知文件工具。");
  return toolRunners[name as CodingToolName](root, input);
}
