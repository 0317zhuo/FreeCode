import { capText, existingPath, hash, readText } from "../runtime";
import { readFileInput } from "./schema";

export async function runReadFile(root: string, raw: unknown) {
  const input = readFileInput.parse(raw);
  const text = await readText(await existingPath(root, input.path));
  const lines = text.length === 0 ? [] : text.split("\n");
  const selected = lines.slice(input.startLine - 1, input.startLine - 1 + input.limit);
  const capped = capText(
    selected.map((line, index) => `${input.startLine + index}: ${line}`).join("\n"),
  );
  return {
    text: capped.text,
    hash: hash(text),
    totalLines: lines.length,
    truncated: capped.truncated || input.startLine - 1 + selected.length < lines.length,
  };
}
