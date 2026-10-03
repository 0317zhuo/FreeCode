import type { ReadableStreamDefaultReader } from "node:stream/web";
import { capText, existingPath } from "../runtime";
import { maxOutputBytes } from "../shared";
import { bashInput } from "./schema";

export async function runBash(root: string, raw: unknown) {
  const input = bashInput.parse(raw);
  const cwd = await existingPath(root, input.cwd);
  const child = Bun.spawn(["/bin/bash", "--noprofile", "--norc", "-c", input.command], {
    cwd,
    detached: true,
    env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", TMPDIR: "/tmp", LANG: "C.UTF-8" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const killGroup = () => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* 进程组已退出 */
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    killGroup();
    child.kill("SIGKILL");
  }, input.timeoutMs);
  let remaining = maxOutputBytes;
  let truncated = false;
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  async function capture(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    readers.push(reader);
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      const take = Math.min(remaining, chunk.length);
      remaining -= take;
      if (take < chunk.length) truncated = true;
      if (take > 0) text += decoder.decode(chunk.subarray(0, take), { stream: true });
    }
    // 不刷新截断的多字节字符，保持实际保留字节数的限制。
    return text;
  }
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const completed = child.exited.then((code) => {
      clearTimeout(timer);
      killGroup();
      // 自行创建 session 的后台进程也不能持有管道阻塞结束；容器退出会清理所有进程。
      drainTimer = setTimeout(() => {
        for (const reader of readers) void reader.cancel();
      }, 100);
      return code;
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      capture(child.stdout),
      capture(child.stderr),
      completed,
    ]);
    const keptOut = capText(stdout);
    const keptErr = capText(stderr, maxOutputBytes - Buffer.byteLength(keptOut.text));
    return {
      stdout: keptOut.text,
      stderr: keptErr.text,
      exitCode,
      truncated: truncated || keptOut.truncated || keptErr.truncated,
      timedOut,
    };
  } finally {
    clearTimeout(timer);
    clearTimeout(drainTimer);
    killGroup();
  }
}
