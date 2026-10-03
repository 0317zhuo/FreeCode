import { chatRequestSchema } from "@freecode/contracts";
import { DefaultChatTransport, type UIMessage } from "ai";

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

/** 传输实例按会话创建，地址在 RPC 初始化后读取，令牌在请求时读取。 */
export function createChatTransport(api: string, headers: () => Record<string, string>) {
  return new CheckedChatTransport({
    api,
    headers,
    prepareSendMessagesRequest({ id, messages, body }) {
      const message = messages.at(-1);
      return {
        body: chatRequestSchema.parse({
          conversationId: id,
          requestId: message?.id,
          message,
          mode: body?.mode,
        }),
      };
    },
  });
}
