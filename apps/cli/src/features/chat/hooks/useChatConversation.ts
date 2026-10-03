import { useChat } from "@ai-sdk/react";
import { type AgentMode, defaultAgentMode } from "@freecode/contracts";
import { useEffect, useRef, useState } from "react";
import { readConversation, type SavedConversation } from "../../../lib/conversationApi";
import { rpc, serverHeaders } from "../../../lib/rpc";
import { createChatTransport } from "../transport";

/** 管理一次聊天会话的流式消息；进入页面时自动发送首页传入的提示词。 */
export function useChatConversation(
  conversation: SavedConversation,
  prompt?: string,
  promptMode: AgentMode = defaultAgentMode,
) {
  const [transport] = useState(() => createChatTransport(rpc.ai.$url().href, () => serverHeaders));
  const [runs, setRuns] = useState(conversation.runs);
  const [syncError, setSyncError] = useState<Error>();
  const loadController = useRef<AbortController | null>(null);
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    id: conversation.id,
    messages: conversation.messages,
    transport,
    onFinish() {
      const controller = loadController.current;
      if (!controller) return;
      void readConversation(conversation.id, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setRuns(data.runs);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setSyncError(new Error("生成状态同步失败，请重新打开对话。"));
        });
    },
  });
  const sentInitialPrompt = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    loadController.current = controller;
    if (prompt && !sentInitialPrompt.current) {
      sentInitialPrompt.current = true;
      void sendMessage({ text: prompt }, { body: { mode: promptMode } });
    }
    return () => {
      controller.abort();
      loadController.current = null;
      void stop();
    };
  }, [sendMessage, stop, prompt, promptMode]);

  const remoteBusy = runs.some((run) => run.status === "running");
  useEffect(() => {
    if (!remoteBusy || status === "submitted" || status === "streaming") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await readConversation(conversation.id, controller.signal);
        if (controller.signal.aborted) return;
        setRuns(data.runs);
        setSyncError(undefined);
        setMessages(data.messages);
        if (data.runs.some((run) => run.status === "running"))
          timer = setTimeout(() => void poll(), 1_000);
      } catch {
        if (!controller.signal.aborted) {
          setSyncError(new Error("历史同步失败，正在重试…"));
          timer = setTimeout(() => void poll(), 1_000);
        }
      }
    };
    timer = setTimeout(() => void poll(), 1_000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [remoteBusy, status, conversation.id, setMessages]);

  const messageErrors = Object.fromEntries(
    runs
      .filter((run) => run.error && run.outputMessageId)
      .map((run) => [run.outputMessageId, run.error?.message]),
  );

  return { messages, sendMessage, status, error: error ?? syncError, remoteBusy, messageErrors };
}
