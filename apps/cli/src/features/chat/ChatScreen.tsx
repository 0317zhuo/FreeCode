import { theme } from "../../lib/theme";
import { deriveChatActivity, isChatBusy } from "./chatActivity";
import { getDetailIds } from "./chatParts";
import { ChatComposer } from "./components/ChatComposer";
import { ChatStatus } from "./components/ChatStatus";
import { ConversationList } from "./components/ConversationList";
import { useChatConversation } from "./hooks/useChatConversation";
import { useChatDetailNavigation } from "./hooks/useChatDetailNavigation";

export function ChatScreen({ prompt, onBack }: { prompt: string; onBack: () => void }) {
  const { messages, sendMessage, status, error } = useChatConversation(prompt);
  const detailIds = getDetailIds(messages);
  const { scrollRef, focusMessages, activeDetailId, expandedIds, toggleDetail } =
    useChatDetailNavigation(detailIds);
  const activity = deriveChatActivity(messages, status);

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={theme.background}
      padding={1}
      gap={1}
    >
      <text fg={theme.foreground}>
        <strong>FreeCode</strong> · 聊天
      </text>
      <ConversationList
        messages={messages}
        status={status}
        activity={activity}
        error={error}
        focused={focusMessages}
        selectedDetailId={activeDetailId}
        expandedIds={expandedIds}
        scrollRef={scrollRef}
        onToggleDetail={toggleDetail}
      />
      <ChatStatus activity={activity} error={error} />
      <ChatComposer
        focused={!focusMessages}
        waiting={isChatBusy(status)}
        onSubmit={(text) => void sendMessage({ text })}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions. */}
      <box height={1} flexShrink={0} alignSelf="flex-start" onMouseDown={onBack}>
        <text fg={theme.muted}>← 返回首页</text>
      </box>
    </box>
  );
}
