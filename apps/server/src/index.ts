import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { WorkspaceSandbox } from "@freecode/agent/sandbox";
import { config } from "dotenv";
import app from "./app";
import { closeDb, getDb } from "./db/client";
import { cancelActiveGenerations } from "./features/conversations/generationRuntime";
import { aiRoutePath } from "./routes/ai";
import { createServerRuntime } from "./runtime";

config({ path: resolve(import.meta.dir, "../.env"), quiet: true });

const args = process.argv.slice(2);
const workspace = args[args.indexOf("--workspace") + 1];
const parentPid = Number(args[args.indexOf("--parent-pid") + 1]);
const token = process.env.FREECODE_LOCAL_TOKEN;
if (!args.includes("--workspace") || !workspace || !token) {
  throw new Error("请通过 CLI 启动本地代理后端。工作区和访问令牌由 CLI 提供。");
}
const sandbox = new WorkspaceSandbox(await realpath(workspace));
const runtime = createServerRuntime(sandbox.root, token, sandbox);
let stopServer = () => {};
let parentTimer: ReturnType<typeof setInterval> | undefined;
let shuttingDown = false;
async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(parentTimer);
  stopServer();
  await cancelActiveGenerations();
  await sandbox.close();
  await closeDb();
  process.exit(exitCode);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
if (Number.isInteger(parentPid) && parentPid > 0) {
  parentTimer = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      void shutdown();
    }
  }, 1_000);
}
try {
  await getDb().$queryRaw`SELECT 1`;
  await sandbox.prepare();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, bunServer) {
      if (new URL(request.url).pathname === aiRoutePath) bunServer.timeout(request, 0);
      return app.fetch(request, { runtime });
    },
  });
  stopServer = () => {
    void server.stop(true);
  };
  console.log(JSON.stringify({ type: "ready", url: server.url.href }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "本地后端启动失败。");
  await shutdown(1);
}
