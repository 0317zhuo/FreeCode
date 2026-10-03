import { Hono } from "hono";
import { aiRoutes } from "./routes/ai";
import { conversationsRoutes } from "./routes/conversations";
import { localAuthRoutes } from "./routes/localAuth";
import { systemRoutes } from "./routes/system";
import type { ServerEnv } from "./runtime";

/**
 * 应用组合根：只负责挂载 `routes/` 下的子路由，业务实现放在 `features/`。
 * 子路由保持链式定义，`AppType` 才能把完整的 RPC 类型交给 `hc<AppType>()`。
 */
const app = new Hono<ServerEnv>()
  .route("/", localAuthRoutes)
  .route("/", systemRoutes)
  .route("/", aiRoutes)
  .route("/", conversationsRoutes);

export type AppType = typeof app;

export default app;
