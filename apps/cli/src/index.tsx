import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { startLocalServer } from "./lib/localServer";
import { initializeRpc } from "./lib/rpc";

const workspace = process.cwd();
const startup = new AbortController();
let launching: ReturnType<typeof startLocalServer> | undefined;
let backend: Awaited<ReturnType<typeof startLocalServer>> | undefined;
let renderer: Awaited<ReturnType<typeof createCliRenderer>> | undefined;
let root: ReturnType<typeof createRoot> | undefined;
let shuttingDown: Promise<void> | undefined;

function shutdown(exitCode = 0) {
  shuttingDown ??= (async () => {
    startup.abort();
    root?.unmount();
    renderer?.destroy();
    if (backend) await backend.stop();
    else
      await launching?.then(
        (value) => value.stop(),
        () => {},
      );
    // 先恢复终端并关闭后端，再结束包括开发监听在内的 CLI 进程。
    process.exit(exitCode);
  })();
  return shuttingDown;
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

try {
  launching = startLocalServer(workspace, startup.signal);
  backend = await launching;
  initializeRpc(backend.url, backend.token);
  const { App } = await import("./app/App");
  renderer = await createCliRenderer({ exitOnCtrlC: false, useMouse: true });
  root = createRoot(renderer);
  root.render(<App onQuit={() => void shutdown()} />);
  void backend.exited.then(() => {
    if (!shuttingDown) {
      console.error("本地后端已退出。");
      void shutdown(1);
    }
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "代理启动失败。");
  await shutdown(1);
}
