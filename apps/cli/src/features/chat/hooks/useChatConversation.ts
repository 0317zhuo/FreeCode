import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { rpc } from "../../../lib/rpc";

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

const transport = new CheckedChatTransport({ api: rpc.ai.$url().href });

/** 管理一次聊天会话的流式消息；进入页面时自动发送首页传入的提示词。 */
export function useChatConversation(prompt: string) {
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const sentInitialPrompt = useRef(false);

  useEffect(() => {
    if (!sentInitialPrompt.current) {
      sentInitialPrompt.current = true;
      void sendMessage({ text: prompt });
    }
    return () => {
      void stop();
    };
  }, [sendMessage, stop, prompt]);

  return { messages, sendMessage, status, error };
}
