import { useCompletion } from "@ai-sdk/react";
import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import { useCallback, useEffect, useState } from "react";
import { client } from "../../client";

async function validateCompletionStream(stream: ReadableStream<Uint8Array>) {
  let finished = false;

  try {
    for await (const result of parseJsonEventStream({ stream, schema: uiMessageChunkSchema })) {
      if (!result.success) throw new Error("服务端返回了无效的流数据。");
      if (result.value.type === "abort") throw new Error("生成已中止或超时，请重试。");
      if (result.value.type === "finish") finished = true;
    }

    if (!finished) throw new Error("响应流意外结束，请重试。");
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error("响应流读取失败，请重试。");
  }
}

function preserveCompletionStream(response: Response) {
  if (!response.body) return response;

  const [completionStream, validationStream] = response.body.tee();
  const validation = validateCompletionStream(validationStream);
  const reader = completionStream.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (!chunk.done) {
          controller.enqueue(chunk.value);
          return;
        }

        const error = await validation;
        if (error) throw error;
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const completionFetch = Object.assign(
  async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { prompt: string };
    const response = await client.ai.$post({ json: body }, { init: { signal: init?.signal } });
    const result = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    return result.ok ? preserveCompletionStream(result) : result;
  },
  { preconnect: fetch.preconnect },
);

export function ChatScreen({ prompt, onBack }: { prompt: string; onBack: () => void }) {
  const [hasFinished, setHasFinished] = useState(false);
  const handleFinish = useCallback(() => setHasFinished(true), []);
  const { completion, complete, error, isLoading, stop } = useCompletion({
    api: client.ai.$url().href,
    fetch: completionFetch,
    onFinish: handleFinish,
  });

  useEffect(() => {
    setHasFinished(false);
    void complete(prompt);
    return () => stop();
  }, [complete, prompt, stop]);

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor="#000000"
      padding={2}
      gap={1}
    >
      <text>聊天</text>
      <scrollbox width="100%" flexGrow={1} minHeight={0} border focused>
        <box flexDirection="column" padding={1} gap={1}>
          <text fg="#777777">你</text>
          <text wrapMode="word">{prompt}</text>
          <text fg="#777777">助手</text>
          {completion ? (
            <text wrapMode="word">{completion}</text>
          ) : (
            <text fg="#777777">
              {error
                ? "未收到模型输出。"
                : isLoading
                  ? "正在生成..."
                  : hasFinished
                    ? "模型没有返回文本。"
                    : "准备连接模型..."}
            </text>
          )}
        </box>
      </scrollbox>
      {error && (
        <text fg="#ff6b6b" flexShrink={0}>
          请求失败：{error.message}
        </text>
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions. */}
      <box
        border
        height={3}
        flexShrink={0}
        paddingX={2}
        alignSelf="flex-start"
        onMouseDown={onBack}
      >
        <text>返回首页</text>
      </box>
    </box>
  );
}
