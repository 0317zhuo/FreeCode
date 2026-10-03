import { afterEach, expect, test } from "bun:test";
import { link, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashOutput } from "../tools/bash/schema";
import { readFileOutput } from "../tools/read-file/schema";
import { WorkspaceSandbox } from "./workspaceSandbox";

const resources: { root: string; sandbox: WorkspaceSandbox }[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'freecode-中文 项目,逗号"-')));
  const sandbox = new WorkspaceSandbox(root);
  resources.push({ root, sandbox });
  return { root, sandbox };
}
afterEach(async () => {
  for (const { root, sandbox } of resources.splice(0)) {
    await sandbox.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("真实容器创建、编辑并使用离线 Bun 测试验证，环境与网络隔离", async () => {
  const { root, sandbox } = await fixture();
  await sandbox.execute("createFile", { path: "value.ts", content: "export const value = 1;\n" });
  const before = readFileOutput.parse(await sandbox.execute("readFile", { path: "value.ts" }));
  await sandbox.execute("editFile", {
    path: "value.ts",
    hash: before.hash,
    oldText: "value = 1",
    newText: "value = 2",
  });
  await sandbox.execute("createFile", {
    path: "value.test.ts",
    content:
      'import { expect, test } from "bun:test"; import { value } from "./value"; test("value",()=>expect(value).toBe(2));\n',
  });
  await Bun.write(join(root, ".env"), "LOCAL_VALUE=allowed\n");
  process.env.FREECODE_GUARD_TEST_SECRET = "host-only-sentinel";
  try {
    const result = bashOutput.parse(
      await sandbox.execute("bash", {
        command:
          'bun test; cat .env | rg allowed; printf "secret=%s" "$FREECODE_GUARD_TEST_SECRET"',
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("1 pass");
    expect(result.stdout).toContain("LOCAL_VALUE=allowed");
    expect(result.stdout).not.toContain("host-only-sentinel");
    expect(await Bun.file(join(root, "value.ts")).text()).toContain("value = 2");
    const network = bashOutput.parse(
      await sandbox.execute("bash", { command: 'timeout 1 bash -c "echo >/dev/tcp/1.1.1.1/443"' }),
    );
    expect(network.exitCode).not.toBe(0);
  } finally {
    delete process.env.FREECODE_GUARD_TEST_SECRET;
  }
}, 120_000);

test("真实 Bash 无法跟随外部宿主链接或访问父目录的哨兵", async () => {
  const { root, sandbox } = await fixture();
  const { root: outside } = await fixture();
  await Bun.write(join(outside, "sentinel"), "outside-sentinel");
  await symlink(outside, join(root, "escape"));
  await expect(sandbox.execute("readFile", { path: "../sentinel" })).rejects.toThrow();
  await expect(sandbox.execute("readFile", { path: "escape/sentinel" })).rejects.toThrow();
  const result = bashOutput.parse(
    await sandbox.execute("bash", {
      command: `cat escape/sentinel; printf hacked > escape/sentinel; cat /workspace/../sentinel`,
    }),
  );
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).not.toContain("outside-sentinel");
  expect(await Bun.file(join(outside, "sentinel")).text()).toBe("outside-sentinel");
  const host = bashOutput.parse(
    await sandbox.execute("bash", {
      command: `test ! -e ${JSON.stringify(join(outside, "sentinel"))}; test ! -S /var/run/docker.sock`,
    }),
  );
  expect(host.exitCode).toBe(0);
}, 120_000);

test("挂载前拒绝硬链接与 socket，不把外部 inode 或接口交给 Bash", async () => {
  const { root, sandbox } = await fixture();
  const { root: outside } = await fixture();
  await Bun.write(join(outside, "sentinel"), "outside");
  await link(join(outside, "sentinel"), join(root, "alias"));
  await expect(sandbox.execute("bash", { command: "cat alias" })).rejects.toThrow("硬链接");
  const other = await fixture();
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(join(other.root, "socket"), resolve);
  });
  try {
    await expect(other.sandbox.execute("bash", { command: "ls" })).rejects.toThrow("socket");
  } finally {
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
});

test("Bash 非零退出、大输出、超时和后台进程清理", async () => {
  const { root, sandbox } = await fixture();
  const failed = bashOutput.parse(
    await sandbox.execute("bash", { command: "echo error >&2; exit 7" }),
  );
  expect(failed).toMatchObject({ stderr: "error\n", exitCode: 7, timedOut: false });
  const output = bashOutput.parse(
    await sandbox.execute("bash", {
      command: "yes output | head -c 100000; yes error | head -c 100000 >&2",
    }),
  );
  expect(Buffer.byteLength(output.stdout) + Buffer.byteLength(output.stderr)).toBeLessThanOrEqual(
    65_536,
  );
  expect(output.truncated).toBe(true);
  const binary = bashOutput.parse(
    await sandbox.execute("bash", {
      command: 'bun -e "process.stdout.write(Buffer.alloc(100000,255))"',
    }),
  );
  expect(Buffer.byteLength(binary.stdout) + Buffer.byteLength(binary.stderr)).toBeLessThanOrEqual(
    65_536,
  );
  expect(binary.truncated).toBe(true);
  const timeout = bashOutput.parse(
    await sandbox.execute("bash", {
      command: "echo changed > persisted; sleep 30",
      timeoutMs: 100,
    }),
  );
  expect(timeout.timedOut).toBe(true);
  expect(await Bun.file(join(root, "persisted")).text()).toBe("changed\n");
  const background = bashOutput.parse(
    await sandbox.execute("bash", { command: "(sleep 1; echo orphan > late)& echo done" }),
  );
  expect(background.stdout).toBe("done\n");
  await Bun.sleep(1_200);
  expect(await Bun.file(join(root, "late")).exists()).toBe(false);
}, 120_000);

test("取消终止整个容器，排队工具不会在取消后执行", async () => {
  const { root, sandbox } = await fixture();
  const controller = new AbortController();
  const running = sandbox.execute(
    "bash",
    { command: "echo ready > ready; (sleep 1; echo orphan > late)& sleep 30" },
    controller.signal,
  );
  // 提前安装 rejection handler，取消时不会产生未处理异常。
  const settled = running.then(
    () => false,
    () => true,
  );
  for (let attempt = 0; attempt < 200 && !(await Bun.file(join(root, "ready")).exists()); attempt++)
    await Bun.sleep(25);
  expect(await Bun.file(join(root, "ready")).exists()).toBe(true);
  const queued = sandbox
    .execute("createFile", { path: "queued", content: "禁止写入" }, controller.signal)
    .then(
      () => false,
      () => true,
    );
  controller.abort();
  expect(await settled).toBe(true);
  expect(await queued).toBe(true);
  await Bun.sleep(1_200);
  expect(await Bun.file(join(root, "late")).exists()).toBe(false);
  expect(await Bun.file(join(root, "queued")).exists()).toBe(false);
}, 120_000);
