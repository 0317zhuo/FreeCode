export function SettingsScreen({ onBack }: { onBack: () => void }) {
  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <text>Settings</text>
      <text>There are no settings yet.</text>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions. */}
      <box border paddingX={2} onMouseDown={onBack}>
        <text>Back to home</text>
      </box>
    </box>
  );
}
