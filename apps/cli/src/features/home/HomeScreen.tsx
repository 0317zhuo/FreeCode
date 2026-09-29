import { useEffect, useState } from "react";
import { client } from "../../client";
import { AsciiTitle } from "./components/AsciiTitle";
import { PromptTextarea } from "./components/PromptTextarea";

export function HomeScreen({ onNavigate }: { onNavigate: (path: "/about" | "/settings") => void }) {
  const [serverStatus, setServerStatus] = useState("Server: checking...");

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await client.health.$get({}, { init: { signal: controller.signal } });
        if (!response.ok) throw new Error("Health check failed");
        const data = await response.json();
        setServerStatus(`Server: ${data.status}`);
      } catch {
        if (!controller.signal.aborted) setServerStatus("Server: unavailable");
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, []);

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
        <text>{serverStatus} · Click a page to open it.</text>
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
