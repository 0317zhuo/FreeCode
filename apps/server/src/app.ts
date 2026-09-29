import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("Hello from Hono + Bun!"));
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
