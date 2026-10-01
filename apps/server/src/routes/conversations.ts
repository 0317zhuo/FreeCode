import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  ConversationError,
  createConversation,
  getConversation,
  listConversations,
} from "../features/ai/conversationStore";

export const conversationsRoutes = new Hono()
  .post("/conversations", async (c) => c.json(await createConversation(), 201))
  .get("/conversations", async (c) => c.json(await listConversations()))
  .get("/conversations/:id", zValidator("param", z.object({ id: z.uuid() })), async (c) => {
    try {
      return c.json(await getConversation(c.req.valid("param").id));
    } catch (error) {
      if (error instanceof ConversationError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });
