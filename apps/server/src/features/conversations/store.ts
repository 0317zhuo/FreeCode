import { conversationSchema, type GenerationStatus } from "@freecode/contracts";
import type { UIMessage } from "ai";
import { getDb } from "../../db/client";
import { Prisma } from "../../generated/prisma/client";
import { interruptedAfterMs } from "./timing";

export class ConversationError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409,
  ) {
    super(message);
  }
}

export const jsonValue = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** 180 秒生成超时之外留出余量，只回收失去心跳的运行记录。 */
export async function recoverInterrupted(workspaceRoot: string, conversationId?: string) {
  await getDb().generationRun.updateMany({
    where: {
      conversationId,
      conversation: { workspaceRoot },
      status: "running",
      heartbeatAt: { lt: new Date(Date.now() - interruptedAfterMs) },
    },
    data: {
      status: "interrupted",
      endedAt: new Date(),
      error: { code: "interrupted", message: "服务端生成中断，已保留最近保存的内容。" },
    },
  });
}

export async function createConversation(workspaceRoot: string) {
  return getDb().conversation.create({ data: { workspaceRoot } });
}

export async function listConversations(workspaceRoot: string) {
  await recoverInterrupted(workspaceRoot);
  return getDb().conversation.findMany({
    where: { workspaceRoot },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { id: true, title: true, createdAt: true, lastActivityAt: true },
  });
}

export async function getConversation(id: string, workspaceRoot: string) {
  await recoverInterrupted(workspaceRoot, id);
  const conversation = await getDb().conversation.findUnique({
    where: { id, workspaceRoot },
    include: { messages: { orderBy: { seq: "asc" } }, runs: { orderBy: { startedAt: "asc" } } },
  });
  if (!conversation) throw new ConversationError("对话不存在。", 404);
  const data = {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map(({ id, role, parts, metadata }) => ({
      id,
      role,
      parts,
      ...(metadata == null ? {} : { metadata }),
    })),
    runs: conversation.runs.map(({ id, outputMessageId, status, error, finishReason }) => ({
      id,
      outputMessageId,
      status,
      error,
      finishReason,
    })),
  };
  conversationSchema.parse(data);
  return data;
}

/** 锁住对话后分配顺序号、保存输入并预留输出；索引约束跨进程并发。 */
export async function beginGeneration(
  conversationId: string,
  requestId: string,
  message: UIMessage,
  workspaceRoot: string,
  model: { provider: string; model: string },
) {
  await recoverInterrupted(workspaceRoot, conversationId);
  return getDb().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM conversations WHERE id = ${conversationId}::uuid AND workspace_root = ${workspaceRoot} FOR UPDATE
    `;
    if (!rows.length) throw new ConversationError("对话不存在。", 404);
    if (
      await tx.generationRun.findUnique({
        where: { conversationId_requestId: { conversationId, requestId } },
      })
    ) {
      throw new ConversationError("该请求已保存，请重新打开对话查看结果。", 409);
    }
    if (await tx.generationRun.findFirst({ where: { conversationId, status: "running" } })) {
      throw new ConversationError("该对话正在生成，请稍后重试。", 409);
    }
    if (await tx.message.findUnique({ where: { id: message.id } })) {
      throw new ConversationError("消息 ID 已存在。", 409);
    }
    const history = await tx.message.findMany({
      where: { conversationId, OR: [{ role: "user" }, { responseRun: { status: "completed" } }] },
      orderBy: { seq: "asc" },
    });
    const conversation = await tx.conversation.update({
      where: { id: conversationId },
      data: { nextMessageSeq: { increment: 2 }, lastActivityAt: new Date() },
    });
    if (!conversation.title) {
      const text = message.parts.find((part) => part.type === "text");
      await tx.conversation.update({
        where: { id: conversationId },
        data: { title: text?.text.slice(0, 80) },
      });
    }
    const outputMessageId = crypto.randomUUID();
    await tx.message.createMany({
      data: [
        {
          id: message.id,
          conversationId,
          seq: conversation.nextMessageSeq - 1,
          role: "user",
          parts: jsonValue(message.parts),
          ...(message.metadata === undefined ? {} : { metadata: jsonValue(message.metadata) }),
        },
        {
          id: outputMessageId,
          conversationId,
          seq: conversation.nextMessageSeq,
          role: "assistant",
          parts: [],
        },
      ],
    });
    const run = await tx.generationRun.create({
      data: {
        conversationId,
        requestId,
        inputMessageId: message.id,
        outputMessageId,
        provider: model.provider,
        model: model.model,
      },
    });
    return {
      run,
      outputMessageId,
      history: [...history.map(({ id, role, parts }) => ({ id, role, parts })), message],
    };
  });
}

export async function saveGeneration(
  runId: string,
  outputMessageId: string,
  message: UIMessage,
  final?: {
    status: Exclude<GenerationStatus, "running">;
    error?: { code: string; message: string };
    finishReason?: string;
    usage?: unknown;
  },
) {
  await getDb().$transaction(async (tx) => {
    const run = await tx.generationRun.update({
      where: { id: runId, status: "running" },
      data: {
        heartbeatAt: new Date(),
        ...(final
          ? {
              status: final.status,
              endedAt: new Date(),
              error: final.error ?? Prisma.DbNull,
              finishReason: final.finishReason,
              ...(final.usage ? { usage: jsonValue(final.usage) } : {}),
            }
          : {}),
      },
    });
    await tx.message.update({
      where: { id: outputMessageId },
      data: {
        parts: jsonValue(message.parts),
        ...(message.metadata === undefined ? {} : { metadata: jsonValue(message.metadata) }),
      },
    });
    await tx.conversation.update({
      where: { id: run.conversationId },
      data: { lastActivityAt: new Date() },
    });
  });
}
