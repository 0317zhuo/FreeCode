import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const root = resolve(import.meta.dir, "..");
const envPath = resolve(root, "apps/server/.env");
if (await Bun.file(envPath).exists()) loadEnvFile(envPath);
if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  throw new Error("请先运行 bun run db:up。");
}
const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "");
if (!process.env.TEST_DATABASE_URL) url.pathname = "/freecode_test";
if (!url.pathname.endsWith("_test")) throw new Error("测试数据库名称必须以 _test 结尾。");
process.env.DATABASE_URL = url.href;
process.env.FREECODE_DB_TEST = "1";
for (const args of [
  ["bun", "run", "--cwd", "apps/server", "db:generate"],
  ["bun", "run", "--cwd", "apps/server", "db:deploy"],
  ["bun", "test", ...process.argv.slice(2)],
]) {
  const child = Bun.spawn(args, {
    cwd: root,
    env: { ...process.env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code) {
    process.exitCode = code;
    break;
  }
}
