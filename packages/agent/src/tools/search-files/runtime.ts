import { lstat, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { capText, existingPath, readText, UnsupportedTextFile } from "../runtime";
import { maxOutputBytes } from "../shared";
import { searchFilesInput } from "./schema";

export async function runSearchFiles(root: string, raw: unknown) {
  const input = searchFilesInput.parse(raw);
  const base = await existingPath(root, input.path);
  const matches: { path: string; line: number; text: string }[] = [];
  let truncated = false;
  let budget = maxOutputBytes;
  async function visit(path: string): Promise<void> {
    if (truncated) return;
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort()) {
        if (name === ".git" || name === "node_modules") continue;
        await visit(resolve(path, name));
        if (truncated) break;
      }
      return;
    }
    let text: string;
    try {
      text = await readText(path);
    } catch (error) {
      if (error instanceof UnsupportedTextFile) return;
      throw error;
    }
    for (const [index, line] of text.split("\n").entries()) {
      if (!line.includes(input.query)) continue;
      if (matches.length === 100 || budget <= 0) {
        truncated = true;
        break;
      }
      const capped = capText(line, budget);
      matches.push({ path: relative(root, path), line: index + 1, text: capped.text });
      budget -= Buffer.byteLength(capped.text);
      if (capped.truncated) {
        truncated = true;
        break;
      }
    }
  }
  await visit(base);
  return { matches, truncated };
}
