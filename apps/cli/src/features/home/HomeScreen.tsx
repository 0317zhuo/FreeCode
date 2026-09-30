import { AsciiTitle } from "./components/AsciiTitle";
import { PromptTextarea } from "./components/PromptTextarea";
import { useServerStatus } from "./useServerStatus";

export function HomeScreen({
  onNavigate,
  onSubmitPrompt,
}: {
  onNavigate: (path: "/about" | "/settings" | "/ai") => void;
  onSubmitPrompt: (prompt: string) => void;
}) {
  const serverStatus = useServerStatus();

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor="#000000"
      padding={2}
    >
      <box width="100%" maxWidth={110} flexDirection="column" alignItems="center" gap={3}>
        <AsciiTitle />
        <PromptTextarea onSubmit={onSubmitPrompt} />
        <text>Server: {serverStatus} · Click a page to open it.</text>
        <box flexDirection="row" gap={2}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions. */}
          <box border paddingX={2} onMouseDown={() => onNavigate("/ai")}>
            <text>大模型测试</text>
          </box>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions. */}
          <box border paddingX={2} onMouseDown={() => onNavigate("/about")}>
            <text>About</text>
          </box>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions. */}
          <box border paddingX={2} onMouseDown={() => onNavigate("/settings")}>
            <text>Settings</text>
          </box>
        </box>
      </box>
    </box>
  );
}
