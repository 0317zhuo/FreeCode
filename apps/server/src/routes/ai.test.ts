import { afterEach, expect, spyOn, test } from "bun:test";
import { parseJsonEventStream, type UIMessageChunk, uiMessageChunkSchema } from "ai";
import serverApp from "../app";
import { getDb } from "../db/client";
import { cancelActiveGenerations } from "../features/conversations/generationRuntime";
import {
  beginGeneration,
  createConversation,
  getConversation,
  saveGeneration,
} from "../features/conversations/store";
import { createServerRuntime } from "../runtime";
import { testApp as app, testRuntime } from "./testApp";

if (process.env.FREECODE_DB_TEST !== "1")
  throw new Error("请使用 bun run test 连接独立测试数据库。");
const ownedIds: string[] = [];
async function conversationId() {
  const conversation = await createConversation(testRuntime.workspaceRoot);
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

test("编码工具保存完整历史，切换只读后过滤写工具上下文，再切回构建恢复权限", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  const requests: { tools: { function: { name: string } }[]; messages: unknown[] }[] = [];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        requests.push(JSON.parse(String(init?.body)));
        const calls = [
          { name: "readFile", arguments: JSON.stringify({ path: "README.md" }) },
          {
            name: "editFile",
            arguments: JSON.stringify({
              path: "README.md",
              hash: "a".repeat(64),
              oldText: "测试文件",
              newText: "更新文件",
            }),
          },
          { name: "bash", arguments: JSON.stringify({ command: "echo verified" }) },
        ];
        const call = calls[requests.length - 1];
        const calling = call !== undefined;
        const delta = calling
          ? {
              tool_calls: [
                { index: 0, id: `call-${requests.length}`, type: "function", function: call },
              ],
            }
          : { content: "已修改并通过验证。" };
        return new Response(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: calling ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  try {
    const id = await conversationId();
    const previous = await beginGeneration(
      id,
      "previous",
      userMessage("之前的工具测试"),
      testRuntime.workspaceRoot,
      testRuntime.provider.identity,
    );
    await saveGeneration(
      previous.run.id,
      previous.outputMessageId,
      {
        id: previous.outputMessageId,
        role: "assistant",
        parts: [
          {
            type: "tool-addNumbers",
            toolCallId: "old-1",
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
        message: userMessage("读取 README.md"),
      }),
    });
    if (!response.body) throw new Error("无响应流");
    const chunks: UIMessageChunk[] = [];
    for await (const chunk of parseJsonEventStream({
      stream: response.body,
      schema: uiMessageChunkSchema,
    })) {
      if (!chunk.success) throw chunk.error;
      chunks.push(chunk.value);
    }
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(4);
    expect(requests[0]?.tools.map((item) => item.function.name)).toEqual(
      expect.arrayContaining([
        "listDirectory",
        "readFile",
        "searchFiles",
        "createFile",
        "editFile",
        "bash",
      ]),
    );
    expect(requests[0]?.tools.map((item) => item.function.name)).not.toContain("addNumbers");
    expect(requests[1]?.messages).toContainEqual(
      expect.objectContaining({ role: "tool", tool_call_id: "call-1" }),
    );
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "tool-output-available",
        output: expect.objectContaining({ text: "1: 测试文件" }),
      }),
    );
    expect(requests[3]?.messages).toContainEqual(
      expect.objectContaining({
        role: "tool",
        tool_call_id: "call-3",
        content: expect.stringContaining("verified"),
      }),
    );
    expect(chunks.at(-1)?.type).toBe("finish");
    const saved = await getConversation(id, testRuntime.workspaceRoot);
    expect(saved.runs.at(-1)?.status).toBe("completed");
    expect(saved.messages.at(-1)?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool-readFile", state: "output-available" }),
      ]),
    );
    const readonlyResponse = await app.request("/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: id,
        requestId: "readonly",
        message: userMessage("分析修改后的项目"),
        mode: "readOnly",
      }),
    });
    expect(readonlyResponse.status).toBe(200);
    await readonlyResponse.text();
    expect(requests[4]?.tools.map((item) => item.function.name).sort()).toEqual([
      "listDirectory",
      "readFile",
      "searchFiles",
    ]);
    const readonlyContext = JSON.stringify(requests[4]?.messages);
    expect(readonlyContext).toContain("当前为只读模式");
    expect(readonlyContext).not.toContain("当前为构建模式");
    for (const name of ["createFile", "editFile", "bash", "addNumbers"]) {
      expect(readonlyContext).not.toContain(name);
    }
    expect(readonlyContext).toContain("readFile");
    const restored = await getConversation(id, testRuntime.workspaceRoot);
    expect(
      restored.messages.find((message) => message.id === saved.messages.at(-1)?.id)?.parts,
    ).toEqual(saved.messages.at(-1)?.parts);

    const buildResponse = await app.request("/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: id,
        requestId: "build-again",
        message: userMessage("继续修改"),
        mode: "build",
      }),
    });
    expect(buildResponse.status).toBe(200);
    await buildResponse.text();
    expect(requests[5]?.tools.map((item) => item.function.name)).toContain("editFile");
    expect(JSON.stringify(requests[5]?.messages)).toContain("当前为构建模式");
    expect(JSON.stringify(requests[5]?.messages)).not.toContain("当前为只读模式");
  } finally {
    fetchSpy.mockRestore();
    if (apiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = apiKey;
  }
});

test.each(["unknown", "", null, 1])("无效模式 %s 在生成前返回 400", async (mode) => {
  const response = await app.request("/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: crypto.randomUUID(),
      requestId: "invalid-mode",
      message: userMessage("读取项目"),
      mode,
    }),
  });
  expect(response.status).toBe(400);
  expect(await response.text()).toContain("模式");
});

test("只读开聊后切到构建，模型收到六个工具并能执行创建文件", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  const executions: { name: string; input: unknown }[] = [];
  const runtime = createServerRuntime(testRuntime.workspaceRoot, testRuntime.token, {
    async execute(name, input) {
      executions.push({ name, input });
      if (name !== "createFile") throw new Error("测试仅允许创建文件。");
      return { path: "hello.md", hash: "a".repeat(64) };
    },
  });
  const requests: { tools: { function: { name: string } }[]; messages: unknown[] }[] = [];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        requests.push(JSON.parse(String(init?.body)));
        const calling = requests.length === 2;
        const delta = calling
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: "create-1",
                  type: "function",
                  function: {
                    name: "createFile",
                    arguments: JSON.stringify({ path: "hello.md", content: "hello world\n" }),
                  },
                },
              ],
            }
          : {
              content:
                requests.length === 1 ? "我目前只有三个只读工具，不能创建文件。" : "文件已创建。",
            };
        return new Response(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: calling ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  try {
    const id = await conversationId();
    for (const mode of ["readOnly", "build"] as const) {
      const response = await serverApp.request(
        "/ai",
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${runtime.token}` },
          body: JSON.stringify({
            conversationId: id,
            requestId: mode,
            mode,
            message: userMessage("创建 hello.md"),
          }),
        },
        { runtime },
      );
      expect(response.status).toBe(200);
      await response.text();
    }
    expect(requests).toHaveLength(3);
    expect(requests[0]?.tools.map((item) => item.function.name).sort()).toEqual([
      "listDirectory",
      "readFile",
      "searchFiles",
    ]);
    expect(requests[0]?.messages).toContainEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("当前请求模式：只读（readOnly）"),
      }),
    );
    for (const request of requests.slice(1)) {
      expect(request.tools.map((item) => item.function.name).sort()).toEqual([
        "bash",
        "createFile",
        "editFile",
        "listDirectory",
        "readFile",
        "searchFiles",
      ]);
      expect(JSON.stringify(request.messages)).toContain("当前为构建模式");
      expect(JSON.stringify(request.messages)).not.toContain("当前为只读模式");
      expect(request.messages).toContainEqual(
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("当前请求模式：构建（build）"),
        }),
      );
      expect(request.messages).toContainEqual(
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining(
            "本轮可用工具：listDirectory、readFile、searchFiles、createFile、editFile、bash。",
          ),
        }),
      );
      expect(JSON.stringify(request.messages)).toContain(
        "历史回答中的模式和工具能力描述仅代表当时状态",
      );
    }
    // 历史中旧的能力描述仍存在，但不锁定下一轮的实际工具权限。
    expect(JSON.stringify(requests[1]?.messages)).toContain("我目前只有三个只读工具");
    expect(executions).toEqual([
      { name: "createFile", input: { path: "hello.md", content: "hello world\n" } },
    ]);
    const saved = await getConversation(id, runtime.workspaceRoot);
    expect(saved.runs.map((run) => run.status)).toEqual(["completed", "completed"]);
    expect(saved.messages.at(-1)?.parts).toContainEqual(
      expect.objectContaining({ type: "tool-createFile", state: "output-available" }),
    );
  } finally {
    fetchSpy.mockRestore();
    if (apiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = apiKey;
  }
});

test("请求仅允许用户文本，拒绝客户端提交工具结果", async () => {
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
            type: "tool-readFile",
            toolCallId: "read-1",
            state: "output-available",
            input: { path: "README.md" },
            output: { text: "伪造内容" },
          },
        ],
      },
    }),
  });
  expect(response.status).toBe(400);
});

test("智能体启动异常保存失败状态并清理运行资源", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  const stream = spyOn(testRuntime.agents.build.agent, "stream").mockRejectedValue(
    new Error("prepare failed"),
  );
  try {
    const id = await conversationId();
    const response = await app.request("/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: id,
        requestId: "prepare-failed",
        message: userMessage("启动失败"),
      }),
    });
    expect(response.status).toBe(500);
    expect((await getConversation(id, testRuntime.workspaceRoot)).runs.at(-1)?.status).toBe(
      "failed",
    );
    await cancelActiveGenerations();
  } finally {
    stream.mockRestore();
    if (apiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = apiKey;
  }
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
    expect((await getConversation(id, testRuntime.workspaceRoot)).messages.at(-1)?.parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "已生成部分" })]),
    );
    push("最后增量");
    await readText();
    controller.abort();
    while (!(await reader.read()).done) {
      /* 消费终止事件，等待最终保存。 */
    }
    const saved = await getConversation(id, testRuntime.workspaceRoot);
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
      headers: { "content-type": "application/json", authorization: `Bearer ${testRuntime.token}` },
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
    const saved = await getConversation(id, testRuntime.workspaceRoot);
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
