import { expect, test } from "bun:test";
import { theme } from "../../lib/theme";
import { getActivityLabel, getRoleDisplay, getToolStatus } from "./chatLabels";

test("工具状态文案覆盖 AI SDK 的全部状态", () => {
  expect(
    (
      [
        "input-streaming",
        "input-available",
        "approval-requested",
        "approval-responded",
        "output-available",
        "output-error",
        "output-denied",
      ] as const
    ).map(getToolStatus),
  ).toEqual(["准备参数", "等待结果", "等待确认", "确认已提交", "已完成", "失败", "已拒绝"]);
});

test("角色展示区分标签、配色与 markdown 渲染", () => {
  expect(getRoleDisplay("user")).toEqual({ label: "你", color: theme.user, markdown: false });
  expect(getRoleDisplay("assistant")).toEqual({
    label: "助手",
    color: theme.assistant,
    markdown: true,
  });
  expect(getRoleDisplay("system")).toEqual({
    label: "系统",
    color: theme.assistant,
    markdown: false,
  });
});

test("活动阶段文案包含工具状态", () => {
  expect(getActivityLabel({ phase: "idle" })).toBe("就绪");
  expect(getActivityLabel({ phase: "connecting" })).toBe("连接模型...");
  expect(getActivityLabel({ phase: "awaiting" })).toBe("等待内容...");
  expect(getActivityLabel({ phase: "reasoning" })).toBe("正在推理...");
  expect(getActivityLabel({ phase: "generating" })).toBe("正在生成回答...");
  expect(getActivityLabel({ phase: "failed" })).toBe("请求失败");
  expect(getActivityLabel({ phase: "tool", state: "input-available" })).toBe("工具等待结果");
});
