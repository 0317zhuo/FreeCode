import { expect, spyOn, test } from "bun:test";
import { parseJsonEventStream, type UIMessageChunk, uiMessageChunkSchema } from "ai";
import app from "../app";

test("缺少真实模型密钥时返回配置错误", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  try {
    for (const text of ["你好", "什么是最好的编程语言？"]) {
      const response = await app.request("/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "u1", role: "user", parts: [{ type: "text", text }] }],
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
    const response = await app.request("/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          { id: "u0", role: "user", parts: [{ type: "text", text: "计算 1 + 2" }] },
          {
            id: "a0",
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
          { id: "u1", role: "user", parts: [{ type: "text", text: prompt }] },
        ],
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
      messages: [
        {
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
        { id: "u2", role: "user", parts: [{ type: "text", text: "继续计算" }] },
      ],
    }),
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "消息格式无效。" });
});
