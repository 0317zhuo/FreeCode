import { zValidator } from "@hono/zod-validator";
import { convertToModelMessages, validateUIMessages } from "ai";
import { Hono } from "hono";
import { chatRequestSchema } from "../features/ai/chatRequestSchema";
import { chatTools } from "../features/ai/chatTools";
import { streamCompletion } from "../features/ai/streamCompletion";

/** `POST /ai` 的路径，入口按路径判断 SSE 连接是否需要取消超时。 */
export const aiRoutePath = "/ai";

/** 聊天补全路由：校验请求体与消息历史后返回流式响应。 */
export const aiRoutes = new Hono().post(
  aiRoutePath,
  zValidator("json", chatRequestSchema, (result, c) => {
    if (!result.success) return c.json({ error: "消息历史不能为空。" }, 400);
  }),
  async (c) => {
    try {
      const messages = await validateUIMessages({
        messages: c.req.valid("json").messages,
        tools: chatTools,
      });
      const lastMessage = messages.at(-1);
      if (
        lastMessage?.role !== "user" ||
        !lastMessage.parts.some((part) => part.type === "text" && part.text.trim())
      ) {
        return c.json({ error: "最后一条消息必须是非空用户文本。" }, 400);
      }
      return streamCompletion(c.req.raw, await convertToModelMessages(messages));
    } catch {
      return c.json({ error: "消息格式无效。" }, 400);
    }
  },
);
