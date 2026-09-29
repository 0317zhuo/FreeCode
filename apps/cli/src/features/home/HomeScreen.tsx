import { AsciiTitle } from "./components/AsciiTitle";
import { PromptTextarea } from "./components/PromptTextarea";

export function HomeScreen({ onNavigate }: { onNavigate: (path: "/about" | "/settings") => void }) {
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
        <PromptTextarea />
        <text>Click a page to open it.</text>
        <box flexDirection="row" gap={2}>
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
