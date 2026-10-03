import { conversationReferenceSchema } from "@freecode/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  ConversationError,
  createConversation,
  getConversation,
  listConversations,
} from "../features/conversations/store";
import type { ServerEnv } from "../runtime";

export const conversationsRoutes = new Hono<ServerEnv>()
  .post("/conversations", async (c) =>
    c.json(await createConversation(c.env.runtime.workspaceRoot), 201),
  )
  .get("/conversations", async (c) => c.json(await listConversations(c.env.runtime.workspaceRoot)))
  .get("/conversations/:id", zValidator("param", conversationReferenceSchema), async (c) => {
    try {
      return c.json(await getConversation(c.req.valid("param").id, c.env.runtime.workspaceRoot));
    } catch (error) {
      if (error instanceof ConversationError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });
