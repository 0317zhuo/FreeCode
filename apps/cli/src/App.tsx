import { useKeyboard } from "@opentui/react";

export function App({ onQuit }: { onQuit: () => void }) {
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
      onQuit();
    }
  });

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor="#0b1220"
      padding={1}
    >
      <box
        width="100%"
        maxWidth={64}
        flexDirection="column"
        gap={1}
        padding={1}
        border
        borderStyle="rounded"
        borderColor="#38bdf8"
        backgroundColor="#111c30"
      >
        <text fg="#38bdf8">
          <strong>FreeCode</strong>
        </text>
        <text fg="#e2e8f0">欢迎使用 Bun Monorepo</text>
        <text fg="#94a3b8">
          server / Hono HTTP 服务
          <br />
          cli / OpenTUI React 终端界面
        </text>
        <text fg="#e2e8f0">
          启动服务：bun run dev:server
          <br />
          项目检查：bun run check
        </text>
        <text fg="#94a3b8">按 Q、Esc 或 Ctrl+C 退出</text>
      </box>
    </box>
  );
}
