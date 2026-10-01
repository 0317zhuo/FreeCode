import { deepSeek } from "@ai-sdk/deepseek";
import {
  APICallError,
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  type ModelMessage,
  RetryError,
  readUIMessageStream,
  StreamProviderError,
  streamText,
  toUIMessageStream,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { chatTools } from "./chatTools";
import { beginGeneration, saveGeneration } from "./conversationStore";
import { activeGenerations } from "./generationRuntime";

/** 把 DeepSeek 的失败原因映射成可以直接展示给用户的中文提示。 */
function describeError(error: unknown) {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)) {
    if (cause.statusCode === 401 || cause.statusCode === 403)
      return "DeepSeek 鉴权失败，请检查服务端 API 密钥。";
    if (cause.statusCode === 402) return "DeepSeek 余额不足，请检查账户余额。";
    if (cause.statusCode === 429) return "DeepSeek 请求过于频繁，请稍后重试。";
  }

  return "模型生成失败，请检查服务端配置或稍后重试。";
}

/** 服务端日志只记录错误名称和状态码，避免把密钥或请求内容写进日志。 */
function logError(error: unknown) {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  console.error("DeepSeek 流式生成失败", {
    name: cause instanceof Error ? cause.name : "UnknownError",
    status:
      APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)
        ? cause.statusCode
        : undefined,
  });
}

/**
 * 调用 DeepSeek 并把模型输出转成 UI Message 流；
 * 客户端断开由 `request.signal` 中止生成，生成总超时为 60 秒。
 */
export async function streamCompletion(
  request: Request,
  conversationId: string,
  requestId: string,
  message: UIMessage,
) {
  const { run, outputMessageId, history } = await beginGeneration(
    conversationId,
    requestId,
    message,
  );
  let latest: UIMessage = { id: outputMessageId, role: "assistant", parts: [] };
  let messages: ModelMessage[];
  try {
    if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error("missing_api_key");
    messages = await convertToModelMessages(
      await validateUIMessages({ messages: history, tools: chatTools }),
    );
  } catch (error) {
    const text =
      error instanceof Error && error.message === "missing_api_key"
        ? "服务端未配置 DEEPSEEK_API_KEY，请填写 apps/server/.env 并重启服务。"
        : "已保存的模型上下文格式无效，请检查服务端。";
    await saveGeneration(run.id, outputMessageId, latest, {
      status: "failed",
      error: { code: "configuration", message: text },
    });
    return new Response(text, { status: 500 });
  }

  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  activeGenerations.set(run.id, { controller, finished });
  let queue = Promise.resolve();
  let persistenceFailed = false;
  const checkpoint = () => {
    const snapshot = structuredClone(latest);
    queue = queue
      .then(() => saveGeneration(run.id, outputMessageId, snapshot))
      .catch(() => {
        persistenceFailed = true;
        controller.abort();
        console.error("生成快照保存失败", { runId: run.id });
      });
  };
  const timer = setInterval(checkpoint, 1_000);

  const result = streamText({
    model: deepSeek("deepseek-flash"),
    messages,
    instructions: "需要计算两个整数相加时，调用 addNumbers 工具，并根据工具结果回答。",
    tools: chatTools,
    stopWhen: isStepCount(3),
    reasoning: "high",
    abortSignal: signal,
    timeout: 60_000,
    onError({ error }) {
      logError(error);
    },
  });

  const uiStream = toUIMessageStream({
    stream: result.stream,
    tools: chatTools,
    onError: describeError,
    generateMessageId: () => outputMessageId,
    async onEnd({ responseMessage, outcome, finishReason }) {
      clearInterval(timer);
      try {
        await queue;
        const cancelled =
          request.signal.aborted || (controller.signal.aborted && !persistenceFailed);
        const status = persistenceFailed
          ? "failed"
          : outcome.status === "completed"
            ? "completed"
            : cancelled
              ? "cancelled"
              : outcome.status === "unknown"
                ? "interrupted"
                : "failed";
        const error =
          status === "completed"
            ? undefined
            : {
                code: status,
                message:
                  status === "cancelled"
                    ? "生成已取消，已保留生成内容。"
                    : persistenceFailed
                      ? "数据库写入失败，生成已停止。"
                      : outcome.status === "failed"
                        ? describeError(outcome.error)
                        : "生成中断或超时，已保留生成内容。",
              };
        await saveGeneration(run.id, outputMessageId, responseMessage, {
          status,
          error,
          finishReason,
          usage: outcome.status === "completed" ? await result.totalUsage : undefined,
        });
      } finally {
        activeGenerations.delete(run.id);
        resolveFinished();
      }
    },
  });
  const [clientStream, snapshotStream] = uiStream.tee();
  void (async () => {
    try {
      for await (const snapshot of readUIMessageStream({ stream: snapshotStream }))
        latest = snapshot;
    } catch {
      controller.abort();
    }
  })();
  return createUIMessageStreamResponse({ consumeSseStream: consumeStream, stream: clientStream });
}
