import { type AgentMode, defaultAgentMode } from "@freecode/contracts";
import { useKeyboard } from "@opentui/react";
import { theme } from "../../lib/theme";
import { AsciiTitle } from "./components/AsciiTitle";
import { PromptTextarea } from "./components/PromptTextarea";
import { type ServerStatus, useServerStatus } from "./hooks/useServerStatus";
import { useStartConversation } from "./hooks/useStartConversation";

const serverStatusLabels: Record<ServerStatus, string> = {
  checking: "checking...",
  ok: "ok",
  unavailable: "unavailable",
};

export function HomeScreen({
  onConversationCreated,
  onHistory,
  mode = defaultAgentMode,
}: {
  onConversationCreated: (id: string, prompt: string) => void;
  onHistory?: () => void;
  mode?: AgentMode;
}) {
  const serverStatus = useServerStatus();
  const { startConversation, waiting, error } = useStartConversation(onConversationCreated);
  useKeyboard((key) => {
    if (key.name === "f2") onHistory?.();
  });

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
        <PromptTextarea
          mode={mode}
          waiting={waiting}
          onSubmit={(prompt) => void startConversation(prompt)}
        />
        {waiting && <text fg={theme.muted}>正在创建对话…</text>}
        {error && <text fg={theme.error}>{error.message}</text>}
        <text>Server: {serverStatusLabels[serverStatus]}</text>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI 鼠标事件。 */}
        <box onMouseDown={onHistory}>
          <text fg={theme.muted}>历史对话 · F2</text>
        </box>
      </box>
    </box>
  );
}
