import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const root = resolve(import.meta.dir, "..");
const envPath = resolve(root, "apps/server/.env");
const envFile = Bun.file(envPath);
const action = process.argv[2];
if (action !== "up" && action !== "down") throw new Error("使用 db:up 或 db:down。");

if (!(await envFile.exists())) {
  await Bun.write(envPath, Bun.file(resolve(root, "apps/server/.env.example")));
}
loadEnvFile(envPath);
let content = await envFile.text();
function setLocalEnv(name: string, value: string) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  content = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;
  process.env[name] = value;
}
if (!process.env.POSTGRES_PASSWORD) {
  setLocalEnv("POSTGRES_PASSWORD", crypto.randomUUID().replaceAll("-", ""));
}
if (!process.env.DATABASE_URL) {
  setLocalEnv(
    "DATABASE_URL",
    `postgresql://freecode:${process.env.POSTGRES_PASSWORD}@127.0.0.1:${process.env.POSTGRES_PORT || "54324"}/freecode`,
  );
}
await Bun.write(envPath, content);

const runtime = ["docker", "podman"].find(
  (name) =>
    Bun.which(name) &&
    Bun.spawnSync([name, "info"], { stdout: "ignore", stderr: "ignore" }).success,
);
if (!runtime) throw new Error("请启动 Docker Desktop 或 Podman machine 后重试。");
const child = Bun.spawn(
  [
    runtime,
    "compose",
    "--env-file",
    envPath,
    "-f",
    resolve(root, "compose.yaml"),
    action,
    ...(action === "up" ? ["-d", "--wait"] : []),
  ],
  { cwd: root, env: { ...process.env }, stdout: "inherit", stderr: "inherit" },
);
process.exitCode = await child.exited;
