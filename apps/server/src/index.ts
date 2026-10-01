import app from "./app";
import { aiRoutePath } from "./routes/ai";

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  fetch(request, bunServer) {
    // SSE 等待模型输出时，由 AI SDK 的生成超时控制连接。
    if (new URL(request.url).pathname === aiRoutePath) bunServer.timeout(request, 0);
    return app.fetch(request);
  },
});

console.log(`服务已启动：${server.url}`);
