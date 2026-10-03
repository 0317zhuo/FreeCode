/** 聊天底部输入区：校验输入后交给上层发送，等待回复时忽略回车。 */
import { type AgentMode, agentModes, defaultAgentMode } from "@freecode/contracts";
import type { TextareaRenderable } from "@opentui/core";
import { useRef } from "react";
import { promptKeyBindings, readPrompt } from "../../../lib/textareaKeys";
import { theme } from "../../../lib/theme";

export function ChatComposer({
  focused,
  waiting,
  onSubmit,
  mode = defaultAgentMode,
}: {
  focused: boolean;
  waiting: boolean;
  onSubmit: (text: string) => void;
  mode?: AgentMode;
}) {
  const textareaRef = useRef<TextareaRenderable>(null);

  function handleSubmit() {
    if (waiting) return;
    const prompt = readPrompt(textareaRef.current);
    if (prompt === undefined) return;
    textareaRef.current?.setText("");
    onSubmit(prompt);
  }

  return (
    <box width="100%" flexShrink={0} flexDirection="column" gap={1}>
      <box height={5} border borderColor={theme.border} padding={1}>
        <textarea
          ref={textareaRef}
          width="100%"
          height="100%"
          focused={focused}
          placeholder="输入下一条消息..."
          wrapMode="word"
          keyBindings={promptKeyBindings}
          onSubmit={handleSubmit}
        />
      </box>
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={theme.accent}>模式：{agentModes[mode].name}</text>
        <text fg={theme.muted}>Tab 切换模式 · Enter 发送 · Shift+Enter 换行</text>
      </box>
      <text fg={theme.muted}>Shift+Tab 切换记录 · 有详情时 j/k 选择、Enter 展开</text>
    </box>
  );
}
