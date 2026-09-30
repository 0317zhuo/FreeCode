import { parseJsonEventStream, readUIMessageStream, uiMessageChunkSchema } from "ai";
import { useEffect, useState } from "react";
import { client } from "../../client";

export function useAiTest() {
  const [content, setContent] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function generate() {
      try {
        const response = await client.ai.$get({}, { init: { signal: controller.signal } });
        if (!response.ok) {
          throw new Error((await response.text()) || `HTTP ${response.status}`);
        }
        if (!response.body) throw new Error("服务端未返回响应流。");

        let finished = false;
        let text = "";
        const stream = parseJsonEventStream({
          stream: response.body,
          schema: uiMessageChunkSchema,
        }).pipeThrough(
          new TransformStream({
            transform(result, controller) {
              if (!result.success) throw new Error("服务端返回了无效的流数据。");
              if (result.value.type === "abort") {
                throw new Error("生成已中止或超时，请重试。");
              }
              if (result.value.type === "finish") finished = true;
              controller.enqueue(result.value);
            },
          }),
        );

        for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
          text = message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("");
          if (!controller.signal.aborted) setContent(text);
        }

        if (!finished) throw new Error("响应流意外结束，请重试。");
        if (!text) throw new Error("模型没有返回文本，请重试。");
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            `请求失败：${error instanceof Error ? error.message : "请检查服务是否启动。"}`,
          );
          controller.abort();
        }
      }
    }

    void generate();
    return () => controller.abort();
  }, []);

  return { content, errorMessage };
}
