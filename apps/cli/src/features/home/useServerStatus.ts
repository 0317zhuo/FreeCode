import { useEffect, useState } from "react";
import { client } from "../../client";

export function useServerStatus() {
  const [serverStatus, setServerStatus] = useState("checking...");

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await client.health.$get({}, { init: { signal: controller.signal } });
        if (!response.ok) throw new Error("Health check failed");
        const data = await response.json();
        if (!controller.signal.aborted) setServerStatus(data.status);
      } catch {
        if (!controller.signal.aborted) setServerStatus("unavailable");
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, []);

  return serverStatus;
}
