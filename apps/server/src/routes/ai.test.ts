import { afterEach, expect, spyOn, test } from "bun:test";
import { parseJsonEventStream, type UIMessageChunk, uiMessageChunkSchema } from "ai";
import app from "../app";
import { getDb } from "../db/client";
import {
  beginGeneration,
  createConversation,
  getConversation,
  saveGeneration,
} from "../features/ai/conversationStore";
import { cancelActiveGenerations } from "../features/ai/generationRuntime";

if (process.env.FREECODE_DB_TEST !== "1")
  throw new Error("请使用 bun run test 连接独立测试数据库。");
const ownedIds: string[] = [];
async function conversationId() {
  const conversation = await createConversation();
  ownedIds.push(conversation.id);
  return conversation.id;
}
afterEach(async () => {
  await getDb().conversation.deleteMany({ where: { id: { in: ownedIds.splice(0) } } });
});
const userMessage = (text: string) => ({
  id: crypto.randomUUID(),
  role: "user" as const,
  parts: [{ type: "text" as const, text }],
});

test("缺少真实模型密钥时返回配置错误", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  try {
    for (const text of ["你好", "什么是最好的编程语言？"]) {
      const response = await app.request("/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: await conversationId(),
          requestId: crypto.randomUUID(),
          message: userMessage(text),
        }),
      });

      expect(response.status).toBe(500);
      expect(await response.text()).toContain("DEEPSEEK_API_KEY");
    }
  } finally {
    if (apiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = apiKey;
  }
});

test("工具定义随提示词发送，执行结果传回模型后继续输出回答", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  const requests: { tools: unknown; messages: unknown[] }[] = [];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        requests.push(JSON.parse(String(init?.body)));
        const callingTool = requests.length === 1;
        const delta = callingTool
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: "add-1",
                  type: "function",
                  function: { name: "addNumbers", arguments: '{"a":123,"b":456}' },
                },
              ],
            }
          : { content: "123 + 456 = 579。" };
        const chunks = [
          { choices: [{ index: 0, delta, finish_reason: null }] },
          {
            choices: [{ index: 0, delta: {}, finish_reason: callingTool ? "tool_calls" : "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          },
        ];
        return new Response(
          `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
          {
            headers: { "content-type": "text/event-stream" },
          },
        );
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );

  try {
    const prompt = "请调用 addNumbers 工具计算 123 + 456。";
    const id = await conversationId();
    const previous = await beginGeneration(id, "previous", userMessage("计算 1 + 2"));
    await saveGeneration(
      previous.run.id,
      previous.outputMessageId,
      {
        id: previous.outputMessageId,
        role: "assistant",
        parts: [
          {
            type: "tool-addNumbers",
            toolCallId: "add-0",
            state: "output-available",
            input: { a: 1, b: 2 },
            output: { result: 3 },
          },
        ],
      },
      { status: "completed" },
    );
    const response = await app.request("/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: id,
        requestId: "current",
        message: userMessage(prompt),
      }),
    });
    if (!response.body) throw new Error("响应没有流内容");
    const chunks: UIMessageChunk[] = [];
    for await (const chunk of parseJsonEventStream({
      stream: response.body,
      schema: uiMessageChunkSchema,
    })) {
      if (!chunk.success) throw chunk.error;
      chunks.push(chunk.value);
    }

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tools).toMatchObject([
      { type: "function", function: { name: "addNumbers", parameters: { type: "object" } } },
    ]);
    expect(requests[0]?.messages).toContainEqual({ role: "user", content: prompt });
    expect(requests[0]?.messages).toContainEqual(
      expect.objectContaining({ role: "tool", tool_call_id: "add-0", content: '{"result":3}' }),
    );
    expect(requests[1]?.messages).toContainEqual(
      expect.objectContaining({ role: "tool", tool_call_id: "add-1", content: '{"result":579}' }),
    );
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "tool-input-available",
        toolName: "addNumbers",
        input: { a: 123, b: 456 },
      }),
    );
    expect(chunks).toContainEqual(
      expect.objectContaining({ type: "tool-output-available", output: { result: 579 } }),
    );
    expect(chunks).toContainEqual(
      expect.objectContaining({ type: "text-delta", delta: "123 + 456 = 579。" }),
    );
    expect(chunks.at(-1)?.type).toBe("finish");
    const saved = await getConversation(id);
    expect(saved.runs.at(-1)?.status).toBe("completed");
    expect(saved.messages.at(-1)?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-addNumbers",
          state: "output-available",
          output: { result: 579 },
        }),
        expect.objectContaining({ type: "text", text: "123 + 456 = 579。" }),
      ]),
    );
  } finally {
    fetchSpy.mockRestore();
    if (apiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = apiKey;
  }
});

test.each([
  { input: { a: "123", b: 456 }, output: { result: 579 } },
  { input: { a: 1_000_000_001, b: 456 }, output: { result: 579 } },
  { input: { a: 123, b: 456 }, output: { result: "579" } },
])("历史工具记录的参数与结果必须通过 schema 校验：%j", async ({ input, output }) => {
  const response = await app.request("/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: crypto.randomUUID(),
      requestId: "invalid",
      message: {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-addNumbers",
            toolCallId: "add-1",
            state: "output-available",
            input,
            output,
          },
        ],
      },
    }),
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "消息格式无效。" });
});

test("一秒快照保存增量内容，断开时保存最后增量并标记 cancelled", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  const controller = new AbortController();
  const encoder = new TextEncoder();
  let push: (text: string) => void = () => {};
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(output) {
            push = (text) =>
              output.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`,
                ),
              );
            push("已生成部分");
            controller.signal.addEventListener("abort", () => output.close(), { once: true });
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  try {
    const id = await conversationId();
    const response = await app.request("/ai", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: id,
        requestId: "cancel",
        message: userMessage("测试取消"),
      }),
    });
    if (!response.body) throw new Error("无响应流");
    const stream = parseJsonEventStream({ stream: response.body, schema: uiMessageChunkSchema });
    const reader = stream.getReader();
    const readText = async () => {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("提前结束");
        if (chunk.value.success && chunk.value.value.type === "text-delta") return;
      }
    };
    await readText();
    await Bun.sleep(1_100);
    expect((await getConversation(id)).messages.at(-1)?.parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "已生成部分" })]),
    );
    push("最后增量");
    await readText();
    controller.abort();
    while (!(await reader.read()).done) {
      /* 消费终止事件，等待最终保存。 */
    }
    const saved = await getConversation(id);
    expect(saved.runs[0]?.status).toBe("cancelled");
    expect(saved.messages.at(-1)?.parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "已生成部分最后增量" })]),
    );
  } finally {
    controller.abort();
    fetchSpy.mockRestore();
    if (apiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = apiKey;
  }
});

test("服务端模型鉴权错误保存在生成记录中，历史接口恢复错误", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "invalid key", type: "authentication_error" } }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  try {
    const id = await conversationId();
    const response = await app.request("/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: id,
        requestId: "failed",
        message: userMessage("测试错误"),
      }),
    });
    expect(await response.text()).toContain("鉴权失败");
    const history = await app.request(`/conversations/${id}`);
    expect(await history.json()).toMatchObject({
      runs: [
        { status: "failed", error: { message: "DeepSeek 鉴权失败，请检查服务端 API 密钥。" } },
      ],
    });
  } finally {
    fetchSpy.mockRestore();
    if (apiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = apiKey;
  }
});

test("真实 HTTP 客户端断开也会取消服务端生成并保存部分内容", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  const client = new AbortController();
  const server = Bun.serve({ port: 0, fetch: app.fetch });
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(output) {
              output.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "HTTP 部分回答" }, finish_reason: null }] })}\n\n`,
                ),
              );
              init?.signal?.addEventListener("abort", () => output.close(), { once: true });
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
      { preconnect: originalFetch.preconnect },
    ),
  );
  try {
    const id = await conversationId();
    const response = await originalFetch(new URL("/ai", server.url), {
      method: "POST",
      signal: client.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: id,
        requestId: "http-cancel",
        message: userMessage("取消 HTTP"),
      }),
    });
    if (!response.body) throw new Error("无响应流");
    const reader = response.body.getReader();
    while (true) {
      const next = await reader.read();
      if (next.done) throw new Error("响应提前结束");
      if (new TextDecoder().decode(next.value).includes("HTTP 部分回答")) break;
    }
    client.abort();
    for (let attempt = 0; attempt < 40; attempt++) {
      const run = await getDb().generationRun.findFirst({ where: { conversationId: id } });
      if (run?.status !== "running") break;
      await Bun.sleep(50);
    }
    const saved = await getConversation(id);
    expect(saved.runs[0]?.status).toBe("cancelled");
    expect(saved.messages.at(-1)?.parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "HTTP 部分回答" })]),
    );
  } finally {
    client.abort();
    await cancelActiveGenerations();
    await server.stop(true);
    fetchSpy.mockRestore();
    if (apiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = apiKey;
  }
});
