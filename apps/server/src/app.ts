import { Hono } from "hono";

const app = new Hono()
  .get("/", (c) => c.text("Hello from Hono + Bun!"))
  .get("/health", (c) => c.json({ status: "ok" }));

export type AppType = typeof app;

export default app;
