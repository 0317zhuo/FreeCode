import { afterEach, expect, test } from "bun:test";
import app from "../app";
import { getDb } from "../db/client";
import { beginGeneration, saveGeneration } from "../features/ai/conversationStore";

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
  const first = await beginGeneration(id, "first", {
    id: crypto.randomUUID(),
    role: "user",
    metadata: { client: "cli" },
    parts: [{ type: "text", text: "持久化测试" }],
  });
  const assistant = {
    id: first.outputMessageId,
    role: "assistant" as const,
    metadata: { test: true },
    parts: [
      { type: "reasoning" as const, text: "推理过程", state: "done" as const },
      {
        type: "tool-addNumbers" as const,
        toolCallId: "tool-1",
        state: "output-error" as const,
        input: { a: 1, b: 2 },
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
