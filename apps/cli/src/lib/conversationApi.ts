import {
  conversationListSchema,
  conversationReferenceSchema,
  conversationSchema,
} from "@freecode/contracts";
import { validateUIMessages } from "ai";
import { rpc } from "./rpc";

export async function createConversation(signal: AbortSignal) {
  const response = await rpc.conversations.$post(undefined, { init: { signal } });
  if (!response.ok) throw new Error("对话创建失败，请检查服务端数据库后重试。");
  return conversationReferenceSchema.parse(await response.json());
}

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
  return conversationListSchema.parse(await response.json());
}

export type SavedConversation = Awaited<ReturnType<typeof readConversation>>;
