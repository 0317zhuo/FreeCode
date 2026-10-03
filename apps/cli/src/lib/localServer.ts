import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const readySchema = z.object({ type: z.literal("ready"), url: z.url() });

/** 由 CLI 入口调用；路径来自启动目录，服务配置来自应用安装位置。 */
export async function startLocalServer(workspace: string, signal?: AbortSignal) {
  const workspaceRoot = await realpath(workspace);
  const token = crypto.randomUUID() + crypto.randomUUID();
  const applicationRoot = resolve(import.meta.dir, "../../../server");
  const showServerLogs = process.env.FREECODE_SERVER_LOG_TO_TERMINAL === "1";
  const env: Record<string, string> = { FREECODE_LOCAL_TOKEN: token };
  // 只传入可信运行环境；不转发用户项目自动加载的模型、数据库或其他业务配置。
  for (const name of [
    "PATH",
    "HOME",
    "TMPDIR",
    "XDG_RUNTIME_DIR",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "CONTAINER_HOST",
  ]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  signal?.throwIfAborted();
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      resolve(applicationRoot, "src/index.ts"),
      "--workspace",
      workspaceRoot,
      "--parent-pid",
      String(process.pid),
    ],
    {
      cwd: applicationRoot,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: showServerLogs ? "inherit" : "ignore",
    },
  );
  let closing: Promise<void> | undefined;
  const stop = () =>
    (closing ??= (async () => {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      try {
        await child.exited;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    })());
  const onAbort = () => {
    void stop();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const reader = child.stdout.getReader();
  const timer = setTimeout(() => child.kill("SIGTERM"), 300_000);
  try {
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("\n")) {
      const next = await reader.read();
      if (next.done) throw new Error("本地后端启动失败，请检查应用配置、数据库及容器环境。");
      text += decoder.decode(next.value, { stream: true });
      if (text.length > 4096) throw new Error("本地后端启动协议无效。");
    }
    signal?.throwIfAborted();
    const ready = readySchema.parse(JSON.parse(text.split("\n")[0] ?? ""));
    const url = new URL(ready.url);
    if (url.hostname !== "127.0.0.1" || url.protocol !== "http:")
      throw new Error("本地后端地址无效。");
    // 后端 stdout 只用于就绪协议，持续排空防止管道阻塞。
    void (async () => {
      while (!(await reader.read()).done) {
        /* 排空 */
      }
    })().catch(() => {});
    return { url: url.href, token, workspaceRoot, stop, exited: child.exited };
  } catch (error) {
    await stop();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
