import { afterEach, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startLocalServer } from "./localServer";

const roots: string[] = [];
const backends: Awaited<ReturnType<typeof startLocalServer>>[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "freecode-中文 项目-")));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(backends.splice(0).map((backend) => backend.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("从两个目录启动独立本地后端，不加载用户项目的服务配置，退出关闭监听", async () => {
  const one = await fixture();
  const two = await fixture();
  await Bun.write(
    join(one, ".env"),
    "DATABASE_URL=invalid-project-value\nDEEPSEEK_API_KEY=project-secret\n",
  );
  const first = await startLocalServer(one);
  backends.push(first);
  const second = await startLocalServer(two);
  backends.push(second);
  expect(first.workspaceRoot).toBe(one);
  expect(second.workspaceRoot).toBe(two);
  expect(first.url).not.toBe(second.url);
  expect(first.token).not.toBe(second.token);
  expect(new URL(first.url).hostname).toBe("127.0.0.1");
  expect((await fetch(new URL("/health", first.url))).status).toBe(401);
  expect(
    (
      await fetch(new URL("/health", first.url), {
        headers: { authorization: `Bearer ${second.token}` },
      })
    ).status,
  ).toBe(401);
  const response = await fetch(new URL("/health", first.url), {
    headers: { authorization: `Bearer ${first.token}` },
  });
  expect(await response.json()).toEqual({ status: "ok" });
  await first.stop();
  await expect(fetch(new URL("/health", first.url))).rejects.toThrow();
}, 120_000);

test("取消启动、无可用容器和无效工作区都明确失败", async () => {
  const root = await fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(startLocalServer(root, controller.signal)).rejects.toThrow();
  const original = process.env.PATH;
  process.env.PATH = "";
  try {
    await expect(startLocalServer(root)).rejects.toThrow("启动失败");
  } finally {
    if (original === undefined) delete process.env.PATH;
    else process.env.PATH = original;
  }
  await expect(startLocalServer(join(root, "missing"))).rejects.toThrow();
}, 120_000);

test("CLI 父进程意外退出后，本地后端自动关闭", async () => {
  const root = await fixture();
  const source = `import { startLocalServer } from ${JSON.stringify(resolve(import.meta.dir, "localServer.ts"))}; const backend = await startLocalServer(${JSON.stringify(root)}); console.log(JSON.stringify({url: backend.url})); process.exit(0);`;
  const launcher = Bun.spawn([process.execPath, "--no-env-file", "-e", source], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const { url } = JSON.parse(await new Response(launcher.stdout).text()) as { url: string };
  expect(await launcher.exited).toBe(0);
  let closed = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      await fetch(new URL("/health", url), { signal: AbortSignal.timeout(100) });
    } catch {
      closed = true;
      break;
    }
    await Bun.sleep(50);
  }
  expect(closed).toBe(true);
}, 120_000);
