import { useEffect, useState } from "react";
import { rpc } from "../../../lib/rpc";

export type ServerStatus = "checking" | "ok" | "unavailable";

/** 请求 /health 判断服务端是否可用；离开页面时取消进行中的请求。 */
export function useServerStatus() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await rpc.health.$get({}, { init: { signal: controller.signal } });
        if (!response.ok) throw new Error("Health check failed");
        const data = await response.json();
        if (!controller.signal.aborted)
          setServerStatus(data.status === "ok" ? "ok" : "unavailable");
      } catch {
        if (!controller.signal.aborted) setServerStatus("unavailable");
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, []);

  return serverStatus;
}
