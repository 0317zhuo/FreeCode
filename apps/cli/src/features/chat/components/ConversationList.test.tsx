import { afterEach, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import type { ToolUIPart, UIMessage } from "ai";
import { act, useState } from "react";
import { getDetailIds } from "../chatParts";
import { useChatDetailNavigation } from "../hooks/useChatDetailNavigation";
import { ChatStatus } from "./ChatStatus";
import { ConversationList } from "./ConversationList";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(() => {
  act(() => testSetup?.renderer.destroy());
  testSetup = undefined;
});

test("读取工具逐步显示准备、等待、完成与失败状态，并能查看输入输出", async () => {
  let update: (part: ToolUIPart) => void = () => {};
  const initial: ToolUIPart = {
    type: "tool-readFile",
    toolCallId: "add-1",
    state: "input-streaming",
    input: { path: "README" },
  };
  function Conversation() {
    const [part, setPart] = useState(initial);
    update = setPart;
    const messages: UIMessage[] = [{ id: "a1", role: "assistant", parts: [part] }];
    const navigation = useChatDetailNavigation(getDetailIds(messages));
    return (
      <ConversationList
        messages={messages}
        status="streaming"
        activity={{ phase: "tool", state: part.state }}
        error={undefined}
        focused={navigation.focusMessages}
        selectedDetailId={navigation.activeDetailId}
        expandedIds={navigation.expandedIds}
        scrollRef={navigation.scrollRef}
        onToggleDetail={navigation.toggleDetail}
      />
    );
  }

  testSetup = await testRender(<Conversation />, { width: 80, height: 20, kittyKeyboard: true });
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("[工具: readFile] 准备参数");

  const input = { path: "README.md" };
  act(() => update({ ...initial, state: "input-available", input }));
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("[工具: readFile] 等待结果");

  act(() => update({ ...initial, state: "output-available", input, output: { text: "测试内容" } }));
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("[工具: readFile] 已完成");
  act(() => testSetup?.mockInput.pressTab());
  await testSetup.flush();
  act(() => testSetup?.mockInput.pressEnter());
  await testSetup.flush();
  const frame = testSetup.captureCharFrame();
  expect(frame).toContain('"path": "README.md"');
  expect(frame).toContain('"text": "测试内容"');

  act(() => update({ ...initial, state: "output-error", input, errorText: "工具执行失败" }));
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("[工具: readFile] 失败");
  expect(testSetup.captureCharFrame()).toContain("错误 · 工具执行失败");
});

async function renderList(messages: UIMessage[], status: "streaming" | "ready") {
  testSetup = await testRender(
    <ConversationList
      messages={messages}
      status={status}
      activity={{ phase: status === "ready" ? "idle" : "awaiting" }}
      error={undefined}
      focused={false}
      selectedDetailId={undefined}
      expandedIds={new Set()}
      scrollRef={{ current: null }}
      onToggleDetail={() => {}}
    />,
    { width: 80, height: 20, kittyKeyboard: true },
  );
  await testSetup.flush();
  return testSetup.captureCharFrame();
}

test("等待回复时隐藏还没有内容的助手消息", async () => {
  const messages: UIMessage[] = [{ id: "a1", role: "assistant", parts: [] }];
  expect(await renderList(messages, "streaming")).not.toContain("助手");
});

test("回复结束后提示模型没有返回内容", async () => {
  const messages: UIMessage[] = [{ id: "a1", role: "assistant", parts: [] }];
  expect(await renderList(messages, "ready")).toContain("模型没有返回可显示内容。");
});

test.each(["streaming", "done"] as const)("恢复历史文本（%s）时显示保存内容", async (state) => {
  const frame = await renderList(
    [{ id: "saved", role: "assistant", parts: [{ type: "text", text: "已保存的回答", state }] }],
    "ready",
  );
  expect(frame).toContain("已保存的回答");
});

test("按角色显示标签，工具片段显示名称与状态", async () => {
  const messages: UIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "帮我搜索" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-search",
          toolCallId: "call-1",
          state: "output-available",
          input: { query: "hi" },
          output: { hits: 1 },
        },
      ],
    },
  ];

  const frame = await renderList(messages, "ready");
  expect(frame).toContain("你");
  expect(frame).toContain("帮我搜索");
  expect(frame).toContain("助手");
  expect(frame).toContain("[工具: search] 已完成");
});

test("推理直接显示，角色与内容紧凑排列，工具详情仍可用键盘展开", async () => {
  const messages: UIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "查询天气" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "先查询城市天气。", state: "done" },
        { type: "text", text: "我来查一下。", state: "done" },
        {
          type: "dynamic-tool",
          toolName: "weather",
          toolCallId: "call-1",
          state: "output-available",
          input: { city: "杭州" },
          output: { temperature: 22 },
        },
        { type: "text", text: "天气晴朗。", state: "done" },
      ],
    },
  ];

  function Conversation() {
    const navigation = useChatDetailNavigation(getDetailIds(messages));
    return (
      <ConversationList
        messages={messages}
        status="ready"
        activity={{ phase: "idle" }}
        error={undefined}
        focused={navigation.focusMessages}
        selectedDetailId={navigation.activeDetailId}
        expandedIds={navigation.expandedIds}
        scrollRef={navigation.scrollRef}
        onToggleDetail={navigation.toggleDetail}
      />
    );
  }

  testSetup = await testRender(<Conversation />, { width: 80, height: 20, kittyKeyboard: true });
  await testSetup.flush();
  await testSetup.waitForFrame((frame) => frame.includes("天气晴朗。"));
  const lines = testSetup
    .captureCharFrame()
    .split("\n")
    .map((line) => line.trimEnd());
  expect(lines.slice(0, 8)).toEqual([
    "你",
    "查询天气",
    "",
    "助手",
    "先查询城市天气。",
    "我来查一下。",
    "[工具: weather] 已完成",
    "天气晴朗。",
  ]);
  expect(testSetup.captureCharFrame()).not.toContain("输入");

  act(() => testSetup?.mockInput.pressTab());
  await testSetup.flush();
  act(() => testSetup?.mockInput.pressEnter());
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("输入");
  expect(testSetup.captureCharFrame()).toContain('"city": "杭州"');
  expect(testSetup.captureCharFrame()).toContain('"temperature": 22');

  act(() => testSetup?.mockInput.pressEnter());
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).not.toContain("输入");
  expect(testSetup.captureCharFrame()).toContain("先查询城市天气。");
});

test("流式推理和正文逐步更新，请求失败保留已收到的内容", async () => {
  let update: (messages: UIMessage[], error?: Error) => void = () => {};
  function Conversation() {
    const [state, setState] = useState<{ messages: UIMessage[]; error?: Error }>({ messages: [] });
    update = (messages, error) => setState({ messages, error });
    return (
      <box height="100%" flexDirection="column">
        <ConversationList
          messages={state.messages}
          status={state.error ? "error" : "streaming"}
          activity={{ phase: state.error ? "failed" : "generating" }}
          error={state.error}
          focused={false}
          selectedDetailId={undefined}
          expandedIds={new Set()}
          scrollRef={{ current: null }}
          onToggleDetail={() => {}}
        />
        <ChatStatus
          activity={{ phase: state.error ? "failed" : "generating" }}
          error={state.error}
        />
      </box>
    );
  }

  testSetup = await testRender(<Conversation />, { width: 40, height: 12 });
  const message: UIMessage = {
    id: "a1",
    role: "assistant",
    parts: [{ type: "reasoning", text: "先查询", state: "streaming" }],
  };
  act(() => update([message]));
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("先查询");

  const completed: UIMessage = {
    ...message,
    parts: [
      { type: "reasoning", text: "先查询天气。", state: "done" },
      { type: "text", text: "目前晴朗。", state: "streaming" },
    ],
  };
  act(() => update([completed]));
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("先查询天气。");
  expect(testSetup.captureCharFrame()).toContain("目前晴朗。");

  act(() => update([completed], new Error("连接中断")));
  await testSetup.flush();
  const frame = testSetup.captureCharFrame();
  expect(frame).toContain("先查询天气。");
  expect(frame).toContain("目前晴朗。");
  expect(frame).toContain("请求失败：连接中断");
});
