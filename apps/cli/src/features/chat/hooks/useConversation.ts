import { useEffect, useState } from "react";
import { readConversation, type SavedConversation } from "../conversationApi";

/** 加载指定的持久化对话，再允许发送消息；离开时取消加载。 */
export function useConversation(id: string) {
  const [data, setData] = useState<SavedConversation>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError(undefined);
    void readConversation(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error : new Error("对话加载失败。"));
      });
    return () => controller.abort();
  }, [id]);
  return { data, error };
}
