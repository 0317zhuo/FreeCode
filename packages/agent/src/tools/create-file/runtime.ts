import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveWorkspacePath } from "../../sandbox/workspace";
import { hash } from "../runtime";
import { createFileInput } from "./schema";

export async function runCreateFile(root: string, raw: unknown) {
  const input = createFileInput.parse(raw);
  const path = await resolveWorkspacePath(root, input.path);
  await mkdir(dirname(path), { recursive: true });
  await resolveWorkspacePath(root, input.path);
  const file = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    await file.writeFile(input.content, "utf8");
  } finally {
    await file.close();
  }
  return { path: input.path, hash: hash(input.content) };
}
