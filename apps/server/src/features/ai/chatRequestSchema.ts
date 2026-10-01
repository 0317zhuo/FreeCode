import { z } from "zod";

/** 消息协议由 SDK 校验；历史由服务端读取，客户端只提交新输入。 */
export const chatRequestSchema = z.object({
  conversationId: z.uuid(),
  requestId: z.string().min(1).max(128),
  message: z.unknown(),
});
