import { afterEach, expect, spyOn, test } from "bun:test";
import type { UIMessage, UIMessageChunk } from "ai";
import { createChatTransport } from "./transport";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
afterEach(() => fetchSpy?.mockRestore());

const chatId = "19cc578d-7251-4b57-b782-ac19827fc566";
const message: UIMessage = {
  id: "new-message",
  role: "user",
  parts: [{ type: "text", text: "你好" }],
};
const request = {
  trigger: "submit-message" as const,
  chatId,
  messageId: undefined,
  messages: [message],
  abortSignal: undefined,
};

function response(chunks: UIMessageChunk[], fragmentBytes = 3) {
  const data = new TextEncoder().encode(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < data.length; offset += fragmentBytes) {
          controller.enqueue(data.slice(offset, offset + fragmentBytes));
        }
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

async function collect(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

test("解析跨网络块的中文增量，只提交新消息，并在请求时读取令牌", async () => {
  const chunks: UIMessageChunk[] = [
    { type: "start", messageId: "assistant" },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: "中文增量" },
    { type: "text-end", id: "text" },
    { type: "finish", finishReason: "stop" },
  ];
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(response(chunks));
  let token = "initial";
  const transport = createChatTransport("http://127.0.0.1:4321/ai", () => ({
    authorization: token,
  }));
  token = "current";
  const stream = await transport.sendMessages({
    ...request,
    messages: [{ id: "old", role: "user", parts: [{ type: "text", text: "旧输入" }] }, message],
  });
  expect(await collect(stream)).toEqual(chunks);
  const [url, init] = fetchSpy.mock.calls[0] ?? [];
  expect(url).toBe("http://127.0.0.1:4321/ai");
  expect(new Headers(init?.headers).get("authorization")).toBe("current");
  expect(JSON.parse(String(init?.body))).toEqual({
    conversationId: chatId,
    requestId: message.id,
    message,
  });
});

test("连接关闭但缺少 finish 事件时报告意外断流", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    response([
      { type: "start", messageId: "assistant" },
      { type: "text-start", id: "text" },
      { type: "text-delta", id: "text", delta: "部分内容" },
    ]),
  );
  const stream = await createChatTransport("http://localhost/ai", () => ({})).sendMessages(request);
  await expect(collect(stream)).rejects.toThrow("响应流意外结束");
});

test("服务端 abort 事件被识别为生成中止", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(response([{ type: "abort" }]));
  const stream = await createChatTransport("http://localhost/ai", () => ({})).sendMessages(request);
  await expect(collect(stream)).rejects.toThrow("生成已中止或超时");
});

test("不同会话传输实例使用各自的后端地址", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => response([{ type: "finish" }]), { preconnect: fetch.preconnect }),
  );
  for (const port of [4321, 4322]) {
    const stream = await createChatTransport(
      `http://127.0.0.1:${port}/ai`,
      () => ({}),
    ).sendMessages(request);
    await collect(stream);
  }
  expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
    "http://127.0.0.1:4321/ai",
    "http://127.0.0.1:4322/ai",
  ]);
});
