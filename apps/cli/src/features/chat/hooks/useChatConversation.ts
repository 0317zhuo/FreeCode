import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { rpc } from "../../../lib/rpc";
import { readConversation, type SavedConversation } from "../conversationApi";

class CheckedChatTransport extends DefaultChatTransport<UIMessage> {
  protected override processResponseStream(stream: ReadableStream<Uint8Array>) {
    let finished = false;
    return super.processResponseStream(stream).pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (chunk.type === "abort") throw new Error("生成已中止或超时，请重试。");
          if (chunk.type === "finish") finished = true;
          controller.enqueue(chunk);
        },
        flush() {
          if (!finished) throw new Error("响应流意外结束，请重试。");
        },
      }),
    );
  }
}

const transport = new CheckedChatTransport({
  api: rpc.ai.$url().href,
  prepareSendMessagesRequest({ id, messages }) {
    const message = messages.at(-1);
    return { body: { conversationId: id, requestId: message?.id, message } };
  },
});

/** 管理一次聊天会话的流式消息；进入页面时自动发送首页传入的提示词。 */
export function useChatConversation(conversation: SavedConversation, prompt?: string) {
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
      void sendMessage({ text: prompt });
    }
    return () => {
      controller.abort();
      loadController.current = null;
      void stop();
    };
  }, [sendMessage, stop, prompt]);

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
