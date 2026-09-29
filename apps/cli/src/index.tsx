import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app/App";

// Bun --hot 会保留 globalThis；重载前卸载旧组件并释放终端资源。
const runtime = globalThis as typeof globalThis & {
  freecodeCli?: {
    renderer: CliRenderer;
    root: ReturnType<typeof createRoot>;
  };
};

runtime.freecodeCli?.root.unmount();
runtime.freecodeCli?.renderer.destroy();

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
  onDestroy: () => {
    delete runtime.freecodeCli;
  },
});
const root = createRoot(renderer);

runtime.freecodeCli = { renderer, root };
root.render(
  <App
    onQuit={() => {
      root.unmount();
      renderer.destroy();
      // Bun --hot 会保留文件监听；仅在终端资源清理完成后结束进程。
      process.exit(0);
    }}
  />,
);
