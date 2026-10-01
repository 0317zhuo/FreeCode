import { afterEach, expect, test } from "bun:test";
import { getDb } from "../../db/client";
import {
  beginGeneration,
  createConversation,
  getConversation,
  saveGeneration,
} from "./conversationStore";

if (process.env.FREECODE_DB_TEST !== "1")
  throw new Error("请使用 bun run test 连接独立测试数据库。");
const ids: string[] = [];
async function create() {
  const value = await createConversation();
  ids.push(value.id);
  return value.id;
}
const user = (text = "你好") => ({
  id: crypto.randomUUID(),
  role: "user" as const,
  parts: [{ type: "text" as const, text }],
});
afterEach(async () => {
  await getDb().conversation.deleteMany({ where: { id: { in: ids.splice(0) } } });
});

test("两个实例同时提交：只接受一个输入，拒绝另一个请求", async () => {
  const id = await create();
  const results = await Promise.allSettled([
    beginGeneration(id, "one", user()),
    beginGeneration(id, "two", user()),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  const saved = await getConversation(id);
  expect(saved.messages).toHaveLength(2);
  expect(saved.runs).toHaveLength(1);
});

test("重复请求不追加消息；取消的部分回答留在历史但不进入下一轮上下文", async () => {
  const id = await create();
  const message = user();
  const first = await beginGeneration(id, "one", message);
  await saveGeneration(
    first.run.id,
    first.outputMessageId,
    {
      id: first.outputMessageId,
      role: "assistant",
      parts: [{ type: "text", text: "部分回答", state: "streaming" }],
    },
    { status: "cancelled", error: { code: "cancelled", message: "已取消" } },
  );
  await expect(beginGeneration(id, "one", message)).rejects.toThrow("该请求已保存");
  const next = await beginGeneration(id, "two", user("继续"));
  expect(next.history.map((value) => value.role)).toEqual(["user", "user"]);
  const saved = await getConversation(id);
  expect(saved.messages[1]?.parts).toMatchObject([{ text: "部分回答" }]);
  expect(saved.runs[0]?.status).toBe("cancelled");
});

test("失去心跳的生成被恢复为中断，已有内容保留且允许新请求", async () => {
  const id = await create();
  const first = await beginGeneration(id, "one", user());
  await saveGeneration(first.run.id, first.outputMessageId, {
    id: first.outputMessageId,
    role: "assistant",
    parts: [{ type: "text", text: "快照" }],
  });
  await getDb().generationRun.update({
    where: { id: first.run.id },
    data: { heartbeatAt: new Date(Date.now() - 91_000) },
  });
  const saved = await getConversation(id);
  expect(saved.runs[0]?.status).toBe("interrupted");
  expect(saved.messages[1]?.parts).toMatchObject([{ text: "快照" }]);
  expect((await beginGeneration(id, "two", user())).history).toHaveLength(2);
});

test("数据库阻止跨对话关联、非数组 parts 和多个 running 记录", async () => {
  const one = await create();
  const two = await create();
  const first = await beginGeneration(one, "one", user());
  await expect(
    Promise.resolve(
      getDb().generationRun.create({
        data: {
          conversationId: two,
          requestId: "cross",
          inputMessageId: first.run.inputMessageId,
          provider: "test",
          model: "test",
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(
      getDb().generationRun.create({
        data: {
          conversationId: one,
          requestId: "duplicate",
          inputMessageId: first.run.inputMessageId,
          provider: "test",
          model: "test",
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(
      getDb().message.update({ where: { id: first.outputMessageId }, data: { parts: {} } }),
    ),
  ).rejects.toThrow();
});
