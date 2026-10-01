import app from "./app";
import { closeDb } from "./db/client";
import { cancelActiveGenerations } from "./features/ai/generationRuntime";
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

// 入口统一管理退出，热重载时替换旧监听器。
const shared = globalThis as typeof globalThis & { freecodeShutdown?: () => Promise<void> };
if (shared.freecodeShutdown) {
  process.off("SIGINT", shared.freecodeShutdown);
  process.off("SIGTERM", shared.freecodeShutdown);
}
let shuttingDown = false;
shared.freecodeShutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.stop();
  await cancelActiveGenerations();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shared.freecodeShutdown);
process.on("SIGTERM", shared.freecodeShutdown);
