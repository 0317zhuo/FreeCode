import { validateUIMessages } from "ai";
import { z } from "zod";
import { rpc } from "../../lib/rpc";

const summarySchema = z.object({ id: z.uuid(), title: z.string().nullable() });
const conversationSchema = summarySchema.extend({
  messages: z.array(z.unknown()),
  runs: z.array(
    z.object({
      id: z.uuid(),
      outputMessageId: z.string().nullable(),
      status: z.enum(["running", "completed", "failed", "cancelled", "interrupted"]),
      error: z.object({ code: z.string(), message: z.string() }).nullable(),
    }),
  ),
});

export async function readConversation(id: string, signal: AbortSignal) {
  const response = await rpc.conversations[":id"].$get({ param: { id } }, { init: { signal } });
  if (!response.ok) throw new Error("对话加载失败，请检查服务端。");
  const data = conversationSchema.parse(await response.json());
  return {
    ...data,
    messages: data.messages.length ? await validateUIMessages({ messages: data.messages }) : [],
  };
}

export async function readConversations(signal: AbortSignal) {
  const response = await rpc.conversations.$get(undefined, { init: { signal } });
  if (!response.ok) throw new Error("历史对话加载失败，请检查服务端。");
  return z.array(summarySchema).parse(await response.json());
}

export type SavedConversation = Awaited<ReturnType<typeof readConversation>>;
