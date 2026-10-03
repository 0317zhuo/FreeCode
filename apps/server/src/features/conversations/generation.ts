import type { AgentMode } from "@freecode/contracts";
import {
  convertToModelMessages,
  getToolName,
  isToolUIPart,
  type ModelMessage,
  readUIMessageStream,
  toUIMessageStream,
  type UIMessage,
  validateUIMessages,
} from "ai";
import type { ServerRuntime } from "../../runtime";
import { activeGenerations } from "./generationRuntime";
import { beginGeneration, saveGeneration } from "./store";
import { generationTimeoutMs } from "./timing";

/**
 * 编排模型生成与持久化，向路由返回 SDK 消息流；
 * 客户端断开通过 `requestSignal` 中止生成，生成总超时为 180 秒。
 */
export async function generateConversation(
  requestSignal: AbortSignal,
  conversationId: string,
  requestId: string,
  message: UIMessage,
  runtime: ServerRuntime,
  mode: AgentMode,
) {
  const { agent, tools } = runtime.agents[mode];
  const { run, outputMessageId, history } = await beginGeneration(
    conversationId,
    requestId,
    message,
    runtime.workspaceRoot,
    runtime.provider.identity,
  );
  let latest: UIMessage = { id: outputMessageId, role: "assistant", parts: [] };
  let messages: ModelMessage[];
  const configurationError = runtime.provider.configurationError();
  try {
    if (configurationError) throw new Error(configurationError);
    const validated = await validateUIMessages({ messages: history });
    // 保留完整持久化记录，仅过滤本轮模型上下文中的未授权工具片段。
    const context = validated
      .map((message) => ({
        ...message,
        parts: message.parts.filter(
          (part) => !isToolUIPart(part) || Object.hasOwn(tools, getToolName(part)),
        ),
      }))
      .filter((message) => message.parts.length > 0);
    messages = await convertToModelMessages(await validateUIMessages({ messages: context, tools }));
  } catch {
    const text = configurationError ?? "已保存的模型上下文格式无效，请检查服务端。";
    await saveGeneration(run.id, outputMessageId, latest, {
      status: "failed",
      error: { code: "configuration", message: text },
    });
    return { ok: false as const, error: text };
  }

  const controller = new AbortController();
  const signal = AbortSignal.any([requestSignal, controller.signal]);
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

  let result: Awaited<ReturnType<typeof agent.stream>>;
  try {
    result = await agent.stream({
      messages,
      abortSignal: signal,
      timeout: generationTimeoutMs,
    });
  } catch (error) {
    clearInterval(timer);
    controller.abort();
    const status = requestSignal.aborted ? "cancelled" : "failed";
    const text =
      status === "cancelled"
        ? "生成已取消，已保留生成内容。"
        : runtime.provider.describeError(error);
    try {
      await queue;
      runtime.provider.logError(error);
      await saveGeneration(run.id, outputMessageId, latest, {
        status,
        error: { code: status, message: text },
      });
    } finally {
      activeGenerations.delete(run.id);
      resolveFinished();
    }
    return { ok: false as const, error: text };
  }

  const uiStream = toUIMessageStream({
    stream: result.stream,
    tools,
    onError: (error) => {
      runtime.provider.logError(error);
      return runtime.provider.describeError(error);
    },
    generateMessageId: () => outputMessageId,
    async onEnd({ responseMessage, outcome, finishReason }) {
      clearInterval(timer);
      try {
        await queue;
        const cancelled =
          requestSignal.aborted || (controller.signal.aborted && !persistenceFailed);
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
                        ? runtime.provider.describeError(outcome.error)
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
  return { ok: true as const, stream: clientStream };
}
