import { theme } from "../../lib/theme";
import { AsciiTitle } from "./components/AsciiTitle";
import { PromptTextarea } from "./components/PromptTextarea";
import { type ServerStatus, useServerStatus } from "./hooks/useServerStatus";

const serverStatusLabels: Record<ServerStatus, string> = {
  checking: "checking...",
  ok: "ok",
  unavailable: "unavailable",
};

export function HomeScreen({ onSubmitPrompt }: { onSubmitPrompt: (prompt: string) => void }) {
  const serverStatus = useServerStatus();

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme.background}
      padding={2}
    >
      <box width="100%" maxWidth={110} flexDirection="column" alignItems="center" gap={3}>
        <AsciiTitle />
        <PromptTextarea onSubmit={onSubmitPrompt} />
        <text>Server: {serverStatusLabels[serverStatus]}</text>
      </box>
    </box>
  );
}
