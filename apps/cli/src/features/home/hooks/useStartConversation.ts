import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { promptSchema } from "../../../lib/promptSchema";
import { rpc } from "../../../lib/rpc";

const createdConversationSchema = z.object({ id: z.uuid() });

/** 首页提交时创建对话；成功后交给路由打开，离开首页时取消请求。 */
export function useStartConversation(onCreated: (id: string, prompt: string) => void) {
  const pending = useRef<AbortController | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => () => pending.current?.abort(), []);

  async function startConversation(prompt: string) {
    const result = promptSchema.safeParse(prompt);
    if (!result.success || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setWaiting(true);
    setError(undefined);
    try {
      const response = await rpc.conversations.$post(undefined, {
        init: { signal: controller.signal },
      });
      if (!response.ok) throw new Error("对话创建失败，请检查服务端数据库后重试。");
      const conversation = createdConversationSchema.parse(await response.json());
      if (!controller.signal.aborted) onCreated(conversation.id, result.data);
    } catch (error: unknown) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error : new Error("对话创建失败，请重试。"));
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        if (!controller.signal.aborted) setWaiting(false);
      }
    }
  }

  return { startConversation, waiting, error };
}
