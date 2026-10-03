import app from "../app";
import { createServerRuntime } from "../runtime";

/** 模型流与文件操作分开验证，此处只模拟隔离执行器返回值。 */
export const testRuntime = createServerRuntime("/test/routes", "test-token", {
  async execute(name) {
    if (name === "readFile")
      return { text: "1: 测试文件", hash: "a".repeat(64), totalLines: 1, truncated: false };
    if (name === "editFile") return { path: "README.md", hash: "b".repeat(64) };
    if (name === "bash")
      return { stdout: "verified\n", stderr: "", exitCode: 0, truncated: false, timedOut: false };
    throw new Error("测试工具失败。");
  },
});
export const testApp = {
  request(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${testRuntime.token}`);
    return app.request(path, { ...init, headers }, { runtime: testRuntime });
  },
  fetch(request: Request) {
    return app.fetch(request, { runtime: testRuntime });
  },
};
