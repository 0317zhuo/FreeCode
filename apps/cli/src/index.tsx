import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app/App";

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
});
const root = createRoot(renderer);

root.render(
  <App
    onQuit={() => {
      root.unmount();
      renderer.destroy();
      // 恢复终端后结束进程，包括开发模式的文件监听。
      process.exit(0);
    }}
  />,
);
