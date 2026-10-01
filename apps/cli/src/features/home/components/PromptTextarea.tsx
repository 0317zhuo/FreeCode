import type { TextareaRenderable } from "@opentui/core";
import { useRef } from "react";
import { promptKeyBindings, readPrompt } from "../../../lib/textareaKeys";
import { theme } from "../../../lib/theme";

export function PromptTextarea({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const textareaRef = useRef<TextareaRenderable>(null);

  function handleSubmit() {
    const prompt = readPrompt(textareaRef.current);
    if (prompt !== undefined) onSubmit(prompt);
  }

  return (
    <box width="100%" padding={1} backgroundColor="transparent" flexDirection="column">
      <box
        width="100%"
        height={14}
        border
        borderStyle="single"
        borderColor={theme.border}
        padding={1}
        backgroundColor="transparent"
      >
        <textarea
          ref={textareaRef}
          width="100%"
          height="100%"
          placeholder="Describe the app, task, or command you want to build..."
          focused
          wrapMode="word"
          backgroundColor="transparent"
          textColor={theme.foreground}
          cursorColor={theme.accent}
          focusedBackgroundColor="transparent"
          placeholderColor={theme.muted}
          keyBindings={promptKeyBindings}
          onSubmit={handleSubmit}
        />
      </box>
      <text fg={theme.muted}>Enter 发送 · Shift+Enter 换行</text>
    </box>
  );
}
