import { z } from "zod";
import { executeTool } from "../tools/runners";

if (import.meta.main) {
  try {
    const raw: unknown = JSON.parse(await Bun.stdin.text());
    // 入口 schema 与各工具 schema 两次校验，不信任跨进程数据。
    const request = z.object({ name: z.string(), input: z.unknown() }).parse(raw);
    const output = await executeTool("/workspace", request.name, request.input);
    console.log(JSON.stringify({ ok: true, output }));
  } catch (error) {
    console.log(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "工具执行失败。",
      }),
    );
    process.exitCode = 1;
  }
}
