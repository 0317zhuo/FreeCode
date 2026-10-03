export const generationTimeoutMs = 180_000;
// 失联回收必须晚于生成总超时，避免误回收其他进程的正常请求。
export const interruptedAfterMs = generationTimeoutMs + 30_000;
