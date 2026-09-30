import { deepSeek } from "@ai-sdk/deepseek";
import { zValidator } from "@hono/zod-validator";
import {
  APICallError,
  consumeStream,
  createUIMessageStreamResponse,
  RetryError,
  StreamProviderError,
  streamText,
  toUIMessageStream,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";

const completionRequestSchema = z.object({ prompt: z.string().trim().min(1) });

function streamCompletion(request: Request, prompt: string) {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    return new Response("服务端未配置 DEEPSEEK_API_KEY，请填写 apps/server/.env 并重启服务。", {
      status: 500,
    });
  }

  const result = streamText({
    model: deepSeek("deepseek-flash"),
    prompt,
    reasoning: "none",
    abortSignal: request.signal,
    timeout: 60_000,
    onError({ error }) {
      const cause = RetryError.isInstance(error) ? error.lastError : error;
      console.error("DeepSeek 流式生成失败", {
        name: cause instanceof Error ? cause.name : "UnknownError",
        status:
          APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)
            ? cause.statusCode
            : undefined,
      });
    },
  });

  return createUIMessageStreamResponse({
    consumeSseStream: consumeStream,
    stream: toUIMessageStream({
      stream: result.stream,
      onError(error) {
        const cause = RetryError.isInstance(error) ? error.lastError : error;

        if (APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)) {
          if (cause.statusCode === 401 || cause.statusCode === 403) {
            return "DeepSeek 鉴权失败，请检查服务端 API 密钥。";
          }
          if (cause.statusCode === 402) return "DeepSeek 余额不足，请检查账户余额。";
          if (cause.statusCode === 429) return "DeepSeek 请求过于频繁，请稍后重试。";
        }

        return "模型生成失败，请检查服务端配置或稍后重试。";
      },
    }),
  });
}

const app = new Hono()
  .get("/", (c) => c.text("Hello from Hono + Bun!"))
  .get("/health", (c) => c.json({ status: "ok" }))
  .get("/ai", (c) => streamCompletion(c.req.raw, "请用中文写一首小诗。"))
  .post(
    "/ai",
    zValidator("json", completionRequestSchema, (result, c) => {
      if (!result.success) return c.json({ error: "提示词必须为非空文本。" }, 400);
    }),
    (c) => streamCompletion(c.req.raw, c.req.valid("json").prompt),
  );

export type AppType = typeof app;

export default app;
