import type { SavedConversation } from "../../lib/conversationApi";
import { theme } from "../../lib/theme";
import { deriveChatActivity, isChatBusy } from "./chatActivity";
import { getDetailIds } from "./chatParts";
import { ChatComposer } from "./components/ChatComposer";
import { ChatStatus } from "./components/ChatStatus";
import { ConversationList } from "./components/ConversationList";
import { useChatConversation } from "./hooks/useChatConversation";
import { useChatDetailNavigation } from "./hooks/useChatDetailNavigation";
import { useConversation } from "./hooks/useConversation";

export function ChatScreen({
  prompt,
  conversationId,
  onBack,
}: {
  prompt?: string;
  conversationId: string;
  onBack: () => void;
}) {
  const { data, error } = useConversation(conversationId);
  if (!data)
    return (
      <box padding={1} flexDirection="column" gap={1}>
        <text>{error?.message ?? "正在加载对话…"}</text>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI 鼠标事件。 */}
        <box onMouseDown={onBack}>
          <text>← 返回首页</text>
        </box>
      </box>
    );
  return <ChatContent key={data.id} conversation={data} prompt={prompt} onBack={onBack} />;
}

function ChatContent({
  conversation,
  prompt,
  onBack,
}: {
  conversation: SavedConversation;
  prompt?: string;
  onBack: () => void;
}) {
  const { messages, sendMessage, status, error, remoteBusy, messageErrors } = useChatConversation(
    conversation,
    prompt,
  );
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
        messageErrors={messageErrors}
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
      {remoteBusy && !isChatBusy(status) && (
        <text fg={theme.muted}>服务端正在生成，正在同步已保存内容…</text>
      )}
      <ChatComposer
        focused={!focusMessages}
        waiting={isChatBusy(status) || remoteBusy}
        onSubmit={(text) => void sendMessage({ text })}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions. */}
      <box height={1} flexShrink={0} alignSelf="flex-start" onMouseDown={onBack}>
        <text fg={theme.muted}>← 返回首页</text>
      </box>
    </box>
  );
}
