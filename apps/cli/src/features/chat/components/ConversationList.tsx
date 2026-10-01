/** 聊天记录区：按消息逐块渲染文本、推理、工具与来源，并跟随最新内容滚动。 */
import {
  CodeRenderable,
  type MarkdownOptions,
  type ScrollBoxRenderable,
  SyntaxStyle,
} from "@opentui/core";
import { type ChatStatus, isReasoningUIPart, isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import type { RefObject } from "react";
import { theme } from "../../../lib/theme";
import { type ChatActivity, isChatBusy } from "../chatActivity";
import { getRoleDisplay } from "../chatLabels";
import { ExpandablePart } from "./ExpandablePart";

const markdownStyle = SyntaxStyle.fromStyles({
  default: { fg: theme.foreground },
  keyword: { fg: theme.foreground },
  string: { fg: theme.foreground },
  comment: { fg: theme.foreground },
  number: { fg: theme.foreground },
});

/** 历史内容先显示正文，再异步高亮，避免等待解析器时出现空白。 */
const renderMarkdownNode: NonNullable<MarkdownOptions["renderNode"]> = (_token, context) => {
  const renderable = context.defaultRender();
  if (!renderable) return renderable;
  const nodes = [renderable];
  while (nodes.length) {
    const node = nodes.pop();
    if (!node) continue;
    if (node instanceof CodeRenderable) node.drawUnstyledText = true;
    nodes.push(...node.getChildren());
  }
  return renderable;
};

export function ConversationList({
  messages,
  status,
  activity,
  error,
  focused,
  selectedDetailId,
  expandedIds,
  scrollRef,
  onToggleDetail,
  messageErrors = {},
}: {
  messages: UIMessage[];
  status: ChatStatus;
  activity: ChatActivity;
  error: Error | undefined;
  focused: boolean;
  selectedDetailId: string | undefined;
  expandedIds: Set<string>;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  onToggleDetail: (id: string) => void;
  messageErrors?: Record<string, string | undefined>;
}) {
  const busy = isChatBusy(status);
  const lastMessage = messages.at(-1);
  const lastAssistantId = lastMessage?.role === "assistant" ? lastMessage.id : undefined;

  return (
    <scrollbox
      ref={scrollRef}
      width="100%"
      flexGrow={1}
      minHeight={0}
      focused={focused}
      stickyScroll
      stickyStart="bottom"
    >
      <box flexDirection="column" gap={1} paddingRight={1}>
        {messages.map((message) => {
          const isLastAssistant = message.id === lastAssistantId;
          const hasVisiblePart = message.parts.some((part) => part.type !== "step-start");
          const display = getRoleDisplay(message.role);

          if (isLastAssistant && !hasVisiblePart && busy) return null;

          return (
            <box key={message.id} flexDirection="column">
              <text fg={display.color}>{display.label}</text>
              {message.parts.map((part, index) => {
                const partId = `${message.id}:${index}`;
                if (isTextUIPart(part)) {
                  return display.markdown ? (
                    <markdown
                      key={partId}
                      renderNode={renderMarkdownNode}
                      content={part.text}
                      syntaxStyle={markdownStyle}
                      streaming={busy && isLastAssistant && part.state !== "done"}
                      internalBlockMode="top-level"
                    />
                  ) : (
                    <text key={partId} fg={theme.foreground} wrapMode="word">
                      {part.text}
                    </text>
                  );
                }
                if (isReasoningUIPart(part)) {
                  return (
                    <text key={partId} fg={theme.reasoning} wrapMode="word">
                      {part.text}
                    </text>
                  );
                }
                if (isToolUIPart(part)) {
                  return (
                    <ExpandablePart
                      key={partId}
                      id={partId}
                      part={part}
                      selected={focused && selectedDetailId === partId}
                      expanded={expandedIds.has(partId)}
                      onToggle={onToggleDetail}
                    />
                  );
                }
                if (part.type === "step-start") return null;
                if (part.type === "source-url") {
                  return (
                    <text key={partId} fg={theme.muted} wrapMode="word">
                      来源 · {part.title ?? part.url}
                    </text>
                  );
                }
                if (part.type === "source-document") {
                  return (
                    <text key={partId} fg={theme.muted} wrapMode="word">
                      来源 · {part.title}
                    </text>
                  );
                }
                if (part.type === "file") {
                  return (
                    <text key={partId} fg={theme.muted} wrapMode="word">
                      文件 · {part.filename ?? part.mediaType}
                    </text>
                  );
                }
                return (
                  <text key={partId} fg={theme.muted}>
                    内容 · {part.type}
                  </text>
                );
              })}
              {messageErrors[message.id] && (
                <text fg={theme.error}>{messageErrors[message.id]}</text>
              )}
              {isLastAssistant &&
                !hasVisiblePart &&
                activity.phase === "idle" &&
                !error &&
                !messageErrors[message.id] && (
                  <text fg={theme.muted}>模型没有返回可显示内容。</text>
                )}
            </box>
          );
        })}
      </box>
    </scrollbox>
  );
}
