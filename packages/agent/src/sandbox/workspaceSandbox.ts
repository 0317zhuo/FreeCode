import { createHash } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import type { Sandbox } from "./interface";
import { inspectWorkspace } from "./workspace";

const dockerfile = `FROM docker.io/oven/bun:1.4.2
RUN apt-get update && apt-get install -y --no-install-recommends bash git ripgrep coreutils && rm -rf /var/lib/apt/lists/*
COPY worker.js /opt/freecode/worker.js
ENTRYPOINT ["bun", "/opt/freecode/worker.js"]
`;
const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), output: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

/** 只使用 argv 启动可信容器 CLI，模型命令只能经 stdin 进入容器。 */
export class WorkspaceSandbox implements Sandbox {
  private runtime?: string;
  private image?: string;
  private ready?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private active = new Map<string, Bun.Subprocess>();
  private stopped = false;
  private preparing?: Bun.Subprocess;

  constructor(readonly root: string) {}

  async prepare() {
    this.ready ??= this.prepareImage();
    await this.ready;
  }

  private async prepareImage() {
    if ((await realpath(this.root)) !== this.root)
      throw new Error("工作区必须是规范化后的真实目录。");
    await inspectWorkspace(this.root);
    for (const candidate of ["docker", "podman"]) {
      const binary = Bun.which(candidate);
      if (!binary) continue;
      const info = Bun.spawn([binary, "info"], { stdout: "ignore", stderr: "ignore" });
      this.preparing = info;
      const timer = setTimeout(() => info.kill("SIGKILL"), 10_000);
      const code = await info.exited;
      clearTimeout(timer);
      if (this.stopped) throw new Error("工具沙箱已关闭。");
      if (code === 0) {
        this.runtime = binary;
        break;
      }
    }
    if (!this.runtime)
      throw new Error("请启动 Docker Desktop 或 Podman machine，代理不会在宿主执行工具。");
    const build = await Bun.build({
      entrypoints: [resolve(import.meta.dir, "worker.ts")],
      target: "bun",
      minify: true,
    });
    if (!build.success || !build.outputs[0]) throw new Error("容器工具入口构建失败。");
    const worker = await build.outputs[0].text();
    const digest = createHash("sha256")
      .update(dockerfile)
      .update(worker)
      .digest("hex")
      .slice(0, 24);
    this.image = `localhost/freecode-tools:${digest}`;
    const inspect = Bun.spawn([this.runtime, "image", "inspect", this.image], {
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await inspect.exited) === 0) return;
    const context = await mkdtemp(resolve(tmpdir(), "freecode-image-"));
    try {
      await Bun.write(resolve(context, "Dockerfile"), dockerfile);
      await Bun.write(resolve(context, "worker.js"), worker);
      const child = Bun.spawn([this.runtime, "build", "-t", this.image, context], {
        stdout: "ignore",
        stderr: "inherit",
      });
      this.preparing = child;
      if (this.stopped) child.kill("SIGKILL");
      if ((await child.exited) !== 0) throw new Error("沙箱镜像构建失败，请检查容器运行环境。");
    } finally {
      await rm(context, { recursive: true, force: true });
    }
  }

  execute(name: string, input: unknown, signal?: AbortSignal) {
    const run = this.queue.then(async () => {
      signal?.throwIfAborted();
      if (this.stopped) throw new Error("工具沙箱已关闭。");
      await this.prepare();
      signal?.throwIfAborted();
      await inspectWorkspace(this.root, signal);
      return this.run(name, input, signal);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  private async remove(name: string) {
    if (!this.runtime) return;
    const child = Bun.spawn(
      [
        this.runtime,
        "rm",
        "--force",
        ...(this.runtime.endsWith("podman") ? ["--time=0"] : []),
        name,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    await child.exited;
  }

  private async run(name: string, input: unknown, signal?: AbortSignal) {
    if (!this.runtime || !this.image) throw new Error("沙箱尚未准备好。");
    const container = `freecode-tool-${crypto.randomUUID()}`;
    // 不继承环境、不自动拉镜像、不挂载管理 socket，禁止嵌套挂载。
    const nonrecursive = this.runtime.endsWith("podman")
      ? "bind-nonrecursive"
      : "bind-recursive=disabled";
    const source = `"source=${this.root.replaceAll('"', '""')}"`;
    const create = Bun.spawn(
      [
        this.runtime,
        "create",
        "--rm",
        "--pull=never",
        "--name",
        container,
        "--interactive",
        "--network=none",
        "--pid=private",
        "--ipc=private",
        "--privileged=false",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit=128",
        "--cpus=2",
        "--memory=1g",
        "--user",
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=64m,mode=1777",
        "--workdir",
        "/workspace",
        "--mount",
        `type=bind,${source},target=/workspace,${nonrecursive}`,
        this.image,
      ],
      { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
    );
    const createTimer = setTimeout(() => create.kill("SIGKILL"), 30_000);
    try {
      if ((await create.exited) !== 0)
        throw new Error("创建工具容器失败，请检查沙箱挂载与运行环境。");
      signal?.throwIfAborted();
      if (this.stopped) throw new Error("工具沙箱已关闭。");
    } catch (error) {
      await this.remove(container);
      throw error;
    } finally {
      clearTimeout(createTimer);
    }
    // 创建完成后才启动，取消不会和容器创建竞争，也不会启动已经取消的命令。
    const child = Bun.spawn([this.runtime, "start", "--attach", "--interactive", container], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.active.set(container, child);
    let timedOut = false;
    let cleanup = Promise.resolve();
    const stop = () => {
      cleanup = this.remove(container).finally(() => child.kill());
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, 90_000);
    signal?.addEventListener("abort", stop, { once: true });
    try {
      signal?.throwIfAborted();
      child.stdin.write(JSON.stringify({ name, input }));
      child.stdin.end();
      // JSON 协议最多 2 MiB，容器错误也有界消费，不输出宿主路径或容器日志给模型。
      async function collect(stream: ReadableStream<Uint8Array>) {
        const parts: Uint8Array[] = [];
        let size = 0;
        for await (const bytes of stream) {
          size += bytes.length;
          if (size > 2_097_152) {
            stop();
            throw new Error("工具结果超过协议大小限制。");
          }
          parts.push(bytes);
        }
        return Buffer.concat(parts).toString("utf8");
      }
      const [stdout, , code] = await Promise.all([
        collect(child.stdout),
        collect(child.stderr),
        child.exited,
      ]);
      await cleanup;
      signal?.throwIfAborted();
      if (timedOut) throw new Error("工具容器超时，已终止全部子进程。");
      let response: z.infer<typeof responseSchema>;
      try {
        response = responseSchema.parse(JSON.parse(stdout));
      } catch {
        throw new Error(`工具容器执行失败（退出码 ${code}），请检查沙箱。`);
      }
      if (!response.ok) throw new Error(response.error);
      if (code !== 0) throw new Error(`工具容器异常退出（${code}）。`);
      return response.output;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      await this.remove(container);
      child.kill();
      await child.exited;
      this.active.delete(container);
    }
  }

  async close() {
    this.stopped = true;
    this.preparing?.kill("SIGKILL");
    await this.ready?.catch(() => {});
    await Promise.allSettled(
      [...this.active].map(async ([name, child]) => {
        await this.remove(name);
        child.kill();
        await child.exited;
      }),
    );
    await this.queue;
  }
}
