import type { AppType } from "@freecode/server";
import { hc } from "hono/client";

// 测试导入组件时不启动后端；真实 CLI 在导入 App 之前完成初始化。
export let rpc = hc<AppType>("http://127.0.0.1:3000");
export let serverHeaders: Record<string, string> = {};

export function initializeRpc(url: string, token: string) {
  serverHeaders = { authorization: `Bearer ${token}` };
  rpc = hc<AppType>(url, { headers: serverHeaders });
}
