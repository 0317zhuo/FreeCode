import { useKeyboard, useRenderer } from "@opentui/react";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "./routes";

/** 应用外壳：安装全局退出快捷键并挂载内存路由。 */
export function App({ onQuit }: { onQuit: () => void }) {
  const renderer = useRenderer();

  useKeyboard((key) => {
    if (
      (key.name === "q" && !renderer.currentFocusedEditor) ||
      key.name === "escape" ||
      (key.ctrl && key.name === "c")
    ) {
      onQuit();
    }
  });

  return (
    <MemoryRouter>
      <AppRoutes />
    </MemoryRouter>
  );
}
