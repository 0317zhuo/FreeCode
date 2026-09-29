import app from "./app";

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  fetch: app.fetch,
});

console.log(`服务已启动：${server.url}`);
