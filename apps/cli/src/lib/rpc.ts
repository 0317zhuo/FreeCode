import type { AppType } from "@freecode/server";
import { hc } from "hono/client";

const defaultServerUrl = "http://localhost:3000";

/** 服务端地址通过 FREECODE_SERVER_URL 覆盖，默认与 apps/server 的默认端口一致。 */
export const rpc = hc<AppType>(Bun.env.FREECODE_SERVER_URL?.trim() || defaultServerUrl);
