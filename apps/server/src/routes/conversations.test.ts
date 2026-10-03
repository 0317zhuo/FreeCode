import { afterEach, expect, test } from "bun:test";
import baseApp from "../app";
import { getDb } from "../db/client";
import { beginGeneration, saveGeneration } from "../features/conversations/store";
import { createServerRuntime } from "../runtime";
import { testApp as app, testRuntime } from "./testApp";

if (process.env.FREECODE_DB_TEST !== "1")
  throw new Error("请使用 bun run test 连接独立测试数据库。");
const ids: string[] = [];
afterEach(async () => {
  await getDb().conversation.deleteMany({ where: { id: { in: ids.splice(0) } } });
});

test("创建和区分对话，通过历史接口恢复工具错误、推理、文本和 metadata", async () => {
  const created = await app.request("/conversations", { method: "POST" });
  expect(created.status).toBe(201);
  const { id } = (await created.json()) as { id: string };
  ids.push(id);
  const first = await beginGeneration(
    id,
    "first",
    {
      id: crypto.randomUUID(),
      role: "user",
      metadata: { client: "cli" },
      parts: [{ type: "text", text: "持久化测试" }],
    },
    testRuntime.workspaceRoot,
    testRuntime.provider.identity,
  );
  const assistant = {
    id: first.outputMessageId,
    role: "assistant" as const,
    metadata: { test: true },
    parts: [
      { type: "reasoning" as const, text: "推理过程", state: "done" as const },
      {
        type: "tool-readFile" as const,
        toolCallId: "tool-1",
        state: "output-error" as const,
        input: { path: "README.md", startLine: 1, limit: 200 },
        errorText: "工具失败",
      },
      { type: "text" as const, text: "最终正文", state: "done" as const },
    ],
  };
  await saveGeneration(first.run.id, first.outputMessageId, assistant, { status: "completed" });
  const history = await app.request(`/conversations/${id}`);
  const body = (await history.json()) as { messages: unknown[] };
  expect(body.messages[0]).toMatchObject({ metadata: { client: "cli" } });
  expect(body.messages[1]).toEqual(assistant);
  const list = await app.request("/conversations");
  expect(await list.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id, title: "持久化测试" })]),
  );
});

test("历史接口校验 UUID，不存在的对话返回 404", async () => {
  expect((await app.request("/conversations/not-a-uuid")).status).toBe(400);
  expect((await app.request(`/conversations/${crypto.randomUUID()}`)).status).toBe(404);
  expect(
    (
      await app.request("/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      })
    ).status,
  ).toBe(400);
});

test("工作区隔离、访问令牌与旧未绑定会话", async () => {
  const other = createServerRuntime("/test/other-workspace", "other-token", {
    async execute() {
      throw new Error("禁止执行");
    },
  });
  const created = await app.request("/conversations", { method: "POST" });
  const { id } = (await created.json()) as { id: string };
  ids.push(id);
  const headers = { authorization: `Bearer ${other.token}`, "content-type": "application/json" };
  const foreign = await baseApp.request(`/conversations/${id}`, { headers }, { runtime: other });
  expect(foreign.status).toBe(404);
  const list = await baseApp.request("/conversations", { headers }, { runtime: other });
  expect(await list.json()).not.toContainEqual(expect.objectContaining({ id }));
  const continuation = await baseApp.request(
    "/ai",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversationId: id,
        requestId: "cross-workspace",
        message: {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: "修改项目" }],
        },
      }),
    },
    { runtime: other },
  );
  expect(continuation.status).toBe(404);
  expect((await getDb().conversation.findUniqueOrThrow({ where: { id } })).workspaceRoot).toBe(
    testRuntime.workspaceRoot,
  );
  expect((await baseApp.request("/health", undefined, { runtime: testRuntime })).status).toBe(401);
  expect(
    (await app.request("/health", { headers: { authorization: "Bearer wrong" } })).status,
  ).toBe(401);
  expect((await app.request("/health")).status).toBe(200);
  const legacy = await getDb().conversation.create({ data: {} });
  ids.push(legacy.id);
  expect((await app.request(`/conversations/${legacy.id}`)).status).toBe(404);
  expect(await (await app.request("/conversations")).json()).not.toContainEqual(
    expect.objectContaining({ id: legacy.id }),
  );
});
