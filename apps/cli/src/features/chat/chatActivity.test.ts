import { expect, test } from "bun:test";
import type { ChatStatus, UIMessage } from "ai";
import { deriveChatActivity, isChatBusy } from "./chatActivity";

function message(role: UIMessage["role"], parts: UIMessage["parts"]): UIMessage {
  return { id: `${role}-1`, role, parts };
}

const userMessage = message("user", [{ type: "text", text: "你好" }]);

test("连接状态直接决定空闲、连接与失败阶段", () => {
  expect(deriveChatActivity([], "ready")).toEqual({ phase: "idle" });
  expect(deriveChatActivity([], "error")).toEqual({ phase: "failed" });
  expect(deriveChatActivity([], "submitted")).toEqual({ phase: "connecting" });
});

test("只有提交中和流式中算进行中", () => {
  const statuses: ChatStatus[] = ["submitted", "streaming", "ready", "error"];
  expect(statuses.map(isChatBusy)).toEqual([true, true, false, false]);
});

test("流式状态下没有助手消息时等待内容", () => {
  expect(deriveChatActivity([], "streaming")).toEqual({ phase: "awaiting" });
  expect(deriveChatActivity([userMessage], "streaming")).toEqual({ phase: "awaiting" });
});

test("按片段自身状态区分推理与生成", () => {
  expect(
    deriveChatActivity(
      [
        message("assistant", [
          { type: "step-start" },
          { type: "reasoning", text: "思考", state: "streaming" },
        ]),
      ],
      "streaming",
    ),
  ).toEqual({ phase: "reasoning" });
  expect(
    deriveChatActivity(
      [
        message("assistant", [
          { type: "step-start" },
          { type: "text", text: "回答", state: "streaming" },
        ]),
      ],
      "streaming",
    ),
  ).toEqual({ phase: "generating" });
});

test("进行中的工具调用按状态展示，终态不再算进行中", () => {
  const toolPart = {
    type: "tool-search",
    toolCallId: "call-1",
    state: "input-available",
    input: { query: "hi" },
  } as const;

  expect(
    deriveChatActivity([message("assistant", [{ type: "step-start" }, toolPart])], "streaming"),
  ).toEqual({ phase: "tool", state: "input-available" });
  expect(
    deriveChatActivity(
      [
        message("assistant", [
          { type: "step-start" },
          { ...toolPart, state: "output-available", output: {} },
        ]),
      ],
      "streaming",
    ),
  ).toEqual({ phase: "awaiting" });
});

test("已完成的文本或推理不再被误报为正在生成", () => {
  expect(
    deriveChatActivity(
      [
        message("assistant", [
          { type: "step-start" },
          { type: "text", text: "前一段", state: "done" },
          { type: "step-start" },
        ]),
      ],
      "streaming",
    ),
  ).toEqual({ phase: "awaiting" });

  expect(
    deriveChatActivity(
      [
        message("assistant", [
          { type: "step-start" },
          { type: "reasoning", text: "思考", state: "done" },
        ]),
      ],
      "streaming",
    ),
  ).toEqual({ phase: "awaiting" });
});

test("只看最后一个 step，且尾随来源片段不影响判断", () => {
  expect(
    deriveChatActivity(
      [
        message("assistant", [
          { type: "step-start" },
          { type: "text", text: "第一段", state: "done" },
          { type: "step-start" },
          { type: "text", text: "第二段", state: "streaming" },
          { type: "source-url", sourceId: "s1", url: "https://example.com" },
        ]),
      ],
      "streaming",
    ),
  ).toEqual({ phase: "generating" });
});
