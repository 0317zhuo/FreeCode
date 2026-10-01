import { Hono } from "hono";

/** 系统路由：根路径欢迎信息与健康检查，不接收业务输入，因此不需要请求校验。 */
export const systemRoutes = new Hono()
  .get("/", (c) => c.text("Hello from Hono + Bun!"))
  .get("/health", (c) => c.json({ status: "ok" }));
