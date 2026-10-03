import { z } from "zod";
import { agentModeSchema, defaultAgentMode } from "./mode";

export const conversationReferenceSchema = z.object({ id: z.uuid() });
export const conversationSummarySchema = conversationReferenceSchema.extend({
  title: z.string().nullable(),
});
export const conversationListSchema = z.array(conversationSummarySchema);

export const generationStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const conversationSchema = conversationSummarySchema.extend({
  // 消息内容使用 AI SDK 自带的校验，不在契约包重复定义协议。
  messages: z.array(z.unknown()),
  runs: z.array(
    z.object({
      id: z.uuid(),
      outputMessageId: z.string().nullable(),
      status: generationStatusSchema,
      error: z.object({ code: z.string(), message: z.string() }).nullable(),
      finishReason: z.string().nullable().optional(),
    }),
  ),
});

/** 历史由服务端读取，客户端只提交新输入；消息协议由 SDK 校验。 */
export const chatRequestSchema = z.object({
  conversationId: z.uuid(),
  requestId: z.string().min(1).max(128),
  message: z.unknown(),
  mode: agentModeSchema.default(defaultAgentMode),
});
