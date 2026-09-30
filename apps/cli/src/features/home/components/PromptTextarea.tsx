import type { TextareaOptions, TextareaRenderable } from "@opentui/core";
import { useRef } from "react";
import { chatPromptSchema } from "../../chat/promptSchema";

const promptKeyBindings = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "linefeed", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "kpenter", shift: true, action: "newline" },
  { name: "linefeed", shift: true, action: "newline" },
  { name: "return", meta: true, action: "newline" },
  { name: "kpenter", meta: true, action: "newline" },
] satisfies TextareaOptions["keyBindings"];

export function PromptTextarea({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const textareaRef = useRef<TextareaRenderable>(null);

  function handleSubmit() {
    const result = chatPromptSchema.safeParse(textareaRef.current?.plainText);
    if (result.success) onSubmit(result.data);
  }

  return (
    <box width="100%" padding={1} backgroundColor="#111111" flexDirection="column">
      <box
        width="100%"
        height={14}
        border
        borderStyle="single"
        borderColor="#454545"
        padding={1}
        backgroundColor="#0b0b0b"
      >
        <textarea
          ref={textareaRef}
          width="100%"
          height="100%"
          placeholder="Describe the app, task, or command you want to build..."
          focused
          wrapMode="word"
          backgroundColor="#0b0b0b"
          textColor="#e5e5e5"
          cursorColor="#f5f5f5"
          focusedBackgroundColor="#0b0b0b"
          placeholderColor="#777777"
          keyBindings={promptKeyBindings}
          onSubmit={handleSubmit}
        />
      </box>
      <text fg="#777777">Enter 发送 · Shift+Enter 换行</text>
    </box>
  );
}
