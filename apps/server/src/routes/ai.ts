import { zValidator } from "@hono/zod-validator";
import { type UIMessage, validateUIMessages } from "ai";
import { Hono } from "hono";
import { chatRequestSchema } from "../features/ai/chatRequestSchema";
import { chatTools } from "../features/ai/chatTools";
import { ConversationError } from "../features/ai/conversationStore";
import { streamCompletion } from "../features/ai/streamCompletion";

/** `POST /ai` 的路径，入口按路径判断 SSE 连接是否需要取消超时。 */
export const aiRoutePath = "/ai";

/** 聊天补全路由：校验请求体与消息历史后返回流式响应。 */
export const aiRoutes = new Hono().post(
  aiRoutePath,
  zValidator("json", chatRequestSchema, (result, c) => {
    if (!result.success) return c.json({ error: "对话 ID、请求 ID 或消息格式无效。" }, 400);
  }),
  async (c) => {
    const input = c.req.valid("json");
    let message: UIMessage;
    try {
      const messages = await validateUIMessages({
        messages: [input.message],
        tools: chatTools,
      });
      const lastMessage = messages[0];
      if (
        lastMessage?.role !== "user" ||
        !lastMessage.id ||
        lastMessage.id.length > 128 ||
        !lastMessage.parts.some((part) => part.type === "text" && part.text.trim()) ||
        lastMessage.parts.some((part) => part.type !== "text")
      ) {
        return c.json({ error: "最后一条消息必须是非空用户文本。" }, 400);
      }
      message = lastMessage;
    } catch {
      return c.json({ error: "消息格式无效。" }, 400);
    }
    try {
      return await streamCompletion(c.req.raw, input.conversationId, input.requestId, message);
    } catch (error) {
      if (error instanceof ConversationError) return c.json({ error: error.message }, error.status);
      console.error("聊天请求失败", error instanceof Error ? error.name : "UnknownError");
      return c.json({ error: "对话保存失败，请检查服务端数据库。" }, 500);
    }
  },
);
