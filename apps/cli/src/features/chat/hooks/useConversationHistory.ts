import { useEffect, useState } from "react";
import { readConversations } from "../../../lib/conversationApi";

export function useConversationHistory() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof readConversations>>>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    const controller = new AbortController();
    void readConversations(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setItems(data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error : new Error("历史加载失败。"));
      });
    return () => controller.abort();
  }, []);
  return { items, error };
}
