import { z } from "zod";

/**
 * `POST /ai` 的请求体：只约束 messages 是非空数组，
 * 单个 UIMessage 的结构交给 AI SDK 的 `validateUIMessages` 校验。
 */
export const chatRequestSchema = z.object({ messages: z.array(z.unknown()).min(1) });
