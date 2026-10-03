import { afterEach, expect, spyOn, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "./App";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
const id = "19cc578d-7251-4b57-b782-ac19827fc566";
const requests: string[] = [];
const saved = {
  id,
  title: "历史测试",
  runs: [
    {
      id: "19cc578d-7251-4b57-b782-ac19827fc567",
      outputMessageId: "a1",
      status: "cancelled",
      error: { code: "cancelled", message: "生成已取消，已保留生成内容。" },
    },
  ],
  messages: [
    {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "已保存的部分回答", state: "streaming" }],
    },
  ],
};
function mockRequests(
  ai?: (init?: RequestInit) => Response,
  historical = false,
  create?: (init?: RequestInit) => Response | Promise<Response>,
) {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
        if (url.pathname === "/health") return Response.json({ status: "ok" });
        if (url.pathname === "/ai")
          return ai?.(init) ?? new Response("测试生成错误", { status: 500 });
        if (url.pathname === "/conversations" && init?.method === "POST")
          return create?.(init) ?? Response.json({ id, title: null }, { status: 201 });
        if (url.pathname === "/conversations") return Response.json([{ id, title: "历史测试" }]);
        return Response.json(historical ? saved : { id, title: null, messages: [], runs: [] });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
}

afterEach(() => {
  act(() => testSetup?.renderer.destroy());
  testSetup = undefined;
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
  requests.length = 0;
});

test("Tab 循环切换模式，输入保持不变，首页与聊天请求使用各自发送时的模式", async () => {
  const sent: { mode: string; message: { parts: { text: string }[] } }[] = [];
  mockRequests((init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response("测试错误", { status: 500 });
  });
  testSetup = await testRender(<App onQuit={() => {}} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
  });
  await act(async () => {
    await testSetup?.flush();
  });
  expect(testSetup.captureCharFrame()).toContain("模式：构建");
  await act(async () => {
    await testSetup?.mockInput.typeText("第一条");
    testSetup?.mockInput.pressTab();
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：只读");
  expect(testSetup.captureCharFrame()).toContain("第一条");
  await act(async () => {
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(sent[0]?.mode).toBe("readOnly");
  expect(sent[0]?.message.parts[0]?.text).toBe("第一条");
  expect(testSetup.captureCharFrame()).toContain("模式：只读");

  await act(async () => {
    await testSetup?.mockInput.typeText("继续构建");
    testSetup?.mockInput.pressTab();
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：构建");
  await act(async () => {
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  expect(sent[1]?.mode).toBe("build");
  expect(sent[1]?.message.parts[0]?.text).toBe("继续构建");

  await act(async () => {
    testSetup?.mockInput.pressTab({ shift: true });
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：构建");
  await act(async () => {
    testSetup?.mockInput.pressTab();
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：只读");
  await act(async () => {
    testSetup?.mockInput.pressTab({ shift: true });
  });
  await testSetup.flush();
  await act(async () => {
    await testSetup?.mockInput.typeText("第三条");
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  expect(sent[2]?.mode).toBe("readOnly");
  expect(sent[2]?.message.parts[0]?.text).toBe("第三条");
});

test("带修饰键的 Tab 不切换模式，Esc 与 Ctrl+C 仍能退出", async () => {
  mockRequests();
  let quits = 0;
  testSetup = await testRender(<App onQuit={() => quits++} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
    exitOnCtrlC: false,
  });
  await act(async () => {
    for (let mask = 1; mask < 16; mask++) {
      testSetup?.mockInput.pressTab({
        shift: Boolean(mask & 1),
        ctrl: Boolean(mask & 2),
        meta: Boolean(mask & 4),
        super: Boolean(mask & 8),
      });
    }
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：构建");
  act(() => testSetup?.mockInput.pressKey("ESCAPE"));
  act(() => testSetup?.mockInput.pressKey("c", { ctrl: true }));
  expect(quits).toBe(2);
});

test("只读首轮正常完成后切换构建，续聊请求携带构建模式且保留前文", async () => {
  const sent: { conversationId: string; mode: string; message: { parts: { text: string }[] } }[] =
    [];
  mockRequests((init) => {
    sent.push(JSON.parse(String(init?.body)));
    const text = sent.length === 1 ? "只读轮已完成，无法创建文件。" : "构建轮已完成。";
    return new Response(
      [
        { type: "start", messageId: `reply-${sent.length}` },
        { type: "text-start", id: "text" },
        { type: "text-delta", id: "text", delta: text },
        { type: "text-end", id: "text" },
        { type: "finish", finishReason: "stop" },
      ]
        .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
        .join(""),
      { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } },
    );
  });
  testSetup = await testRender(<App onQuit={() => {}} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
  });
  await act(async () => {
    testSetup?.mockInput.pressTab();
    await testSetup?.flush();
  });
  await act(async () => {
    await testSetup?.mockInput.typeText("请创建文件");
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  await testSetup.waitForFrame((frame) => frame.includes("只读轮已完成"));
  expect(sent[0]?.mode).toBe("readOnly");
  act(() => testSetup?.mockInput.pressTab());
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：构建");
  await act(async () => {
    await testSetup?.mockInput.typeText("现在创建文件");
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  await testSetup.waitForFrame((frame) => frame.includes("构建轮已完成"));
  expect(sent).toHaveLength(2);
  expect(sent[1]?.mode).toBe("build");
  expect(sent[1]?.conversationId).toBe(sent[0]?.conversationId);
  expect(sent[1]?.message.parts[0]?.text).toBe("现在创建文件");
  expect(testSetup.captureCharFrame()).toContain("只读轮已完成");
});

test("创建对话期间切换模式，首条指令保留提交时的模式", async () => {
  let complete!: (response: Response) => void;
  let sentMode: string | undefined;
  mockRequests(
    (init) => {
      sentMode = JSON.parse(String(init?.body)).mode;
      return new Response("测试错误", { status: 500 });
    },
    false,
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  testSetup = await testRender(<App onQuit={() => {}} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
  });
  await act(async () => {
    testSetup?.mockInput.pressTab();
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：只读");
  await act(async () => {
    await testSetup?.mockInput.typeText("只读指令");
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
    testSetup?.mockInput.pressTab();
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：构建");
  await act(async () => {
    complete(Response.json({ id, title: null }, { status: 201 }));
    await Bun.sleep(20);
  });
  expect(sentMode).toBe("readOnly");
});

test("首页提交提示词后进入聊天页，输入 q 不触发退出", async () => {
  mockRequests();
  let quitCount = 0;
  testSetup = await testRender(<App onQuit={() => quitCount++} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
  });

  await act(async () => {
    await testSetup?.mockInput.typeText("quick chat");
  });
  expect(quitCount).toBe(0);

  await act(async () => {
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("quick chat");
  expect(requests.filter((request) => !request.endsWith("/health")).slice(0, 3)).toEqual([
    "POST /conversations",
    `GET /conversations/${id}`,
    "POST /ai",
  ]);
});

test("创建期间显示等待并阻止重复提交，成功后首条提示词只发送一次", async () => {
  let complete!: (response: Response) => void;
  let calls = 0;
  mockRequests(
    () => {
      calls++;
      return new Response("测试错误", { status: 500 });
    },
    false,
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  testSetup = await testRender(<App onQuit={() => {}} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
  });
  await act(async () => {
    await testSetup?.mockInput.typeText("新对话提示词");
    testSetup?.mockInput.pressEnter();
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("正在创建对话…");
  expect(requests.filter((request) => request === "POST /conversations")).toHaveLength(1);
  expect(calls).toBe(0);
  await act(async () => {
    complete(Response.json({ id, title: null }, { status: 201 }));
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("新对话提示词");
  expect(requests).toContain(`GET /conversations/${id}`);
  expect(calls).toBe(1);
});

test("创建失败保留首页输入，可以用相同提示词重试", async () => {
  let attempts = 0;
  let submittedText: string | undefined;
  mockRequests(
    (init) => {
      submittedText = JSON.parse(String(init?.body)).message.parts[0].text;
      return new Response("测试错误", { status: 500 });
    },
    false,
    () =>
      ++attempts === 1
        ? new Response("数据库暂不可用", { status: 500 })
        : Response.json({ id, title: null }, { status: 201 }),
  );
  testSetup = await testRender(<App onQuit={() => {}} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
  });
  await act(async () => {
    await testSetup?.mockInput.typeText("保留输入");
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("对话创建失败");
  expect(testSetup.captureCharFrame()).toContain("保留输入");
  expect(requests).not.toContain(`GET /conversations/${id}`);
  await act(async () => {
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  expect(attempts).toBe(2);
  expect(submittedText).toBe("保留输入");
});

test("创建期间离开首页取消请求，晚到结果不会打开聊天或发送消息", async () => {
  let complete!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  mockRequests(undefined, false, (init) => {
    signal = init?.signal;
    return new Promise<Response>((resolve) => {
      complete = resolve;
    });
  });
  testSetup = await testRender(<App onQuit={() => {}} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
  });
  await act(async () => {
    await testSetup?.mockInput.typeText("取消创建");
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
    testSetup?.mockInput.pressKey("F2");
    await Bun.sleep(20);
  });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    complete(Response.json({ id, title: null }, { status: 201 }));
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("历史测试");
  expect(requests).not.toContain(`GET /conversations/${id}`);
  expect(requests).not.toContain("POST /ai");
});

test("首页打开历史，恢复部分内容与取消错误，不再次调用模型", async () => {
  let calls = 0;
  mockRequests(() => {
    calls++;
    return new Response();
  }, true);
  testSetup = await testRender(<App onQuit={() => {}} />, {
    width: 100,
    height: 30,
    kittyKeyboard: true,
  });
  await act(async () => {
    testSetup?.mockInput.pressKey("F2");
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("历史测试");
  await act(async () => {
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  await testSetup.flush();
  await testSetup.waitForFrame((frame) => frame.includes("已保存的部分回答"));
  expect(testSetup.captureCharFrame()).toContain("已保存的部分回答");
  expect(testSetup.captureCharFrame()).toContain("生成已取消，已保留生成内容。");
  expect(calls).toBe(0);
});

test("流式显示增量，只提交新消息，卸载时取消请求", async () => {
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let signal: AbortSignal | null | undefined;
  let request:
    | {
        conversationId: string;
        requestId: string;
        message: { id: string };
        messages?: unknown;
        mode: string;
      }
    | undefined;
  const emit = (chunk: object) =>
    streamController?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
  mockRequests((init) => {
    signal = init?.signal;
    request = JSON.parse(String(init?.body));
    return new Response(
      new ReadableStream({
        start(controller) {
          streamController = controller;
        },
      }),
      {
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      },
    );
  });
  testSetup = await testRender(<App onQuit={() => {}} />, {
    width: 100,
    height: 30,
    kittyKeyboard: true,
  });
  await act(async () => {
    await testSetup?.mockInput.typeText("测试增量");
    testSetup?.mockInput.pressEnter();
    await Bun.sleep(20);
  });
  expect(request?.conversationId).toBe(id);
  expect(request?.requestId).toBe(request?.message.id);
  expect(request?.messages).toBeUndefined();
  expect(request?.mode).toBe("build");
  await act(async () => {
    emit({ type: "start", messageId: "a1" });
    emit({ type: "text-start", id: "text" });
    emit({ type: "text-delta", id: "text", delta: "第一部分" });
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("第一部分");
  act(() => testSetup?.mockInput.pressTab());
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("模式：只读");
  expect(request?.mode).toBe("build");
  expect(signal?.aborted).toBe(false);
  await act(async () => {
    emit({ type: "text-delta", id: "text", delta: "第二部分" });
    await Bun.sleep(20);
  });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("第一部分第二部分");
  act(() => testSetup?.renderer.destroy());
  testSetup = undefined;
  expect(signal?.aborted).toBe(true);
  streamController?.close();
});
