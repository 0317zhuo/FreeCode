import type { ToolUIPart, UIMessage } from "ai";
import { theme } from "../../lib/theme";
import type { ChatActivity } from "./chatActivity";

/** 工具调用状态对应的中文文案；键集合由 AI SDK 的 ToolUIPart 状态保证完整。 */
const toolStatusLabels = {
  "input-streaming": "准备参数",
  "input-available": "等待结果",
  "approval-requested": "等待确认",
  "approval-responded": "确认已提交",
  "output-available": "已完成",
  "output-error": "失败",
  "output-denied": "已拒绝",
} satisfies Record<ToolUIPart["state"], string>;

export function getToolStatus(state: ToolUIPart["state"]) {
  return toolStatusLabels[state];
}

/** 对话角色的展示方式：标签、配色与是否按 markdown 渲染；键集合由 UIMessage 角色保证完整。 */
const roleDisplay = {
  user: { label: "你", color: theme.user, markdown: false },
  assistant: { label: "助手", color: theme.assistant, markdown: true },
  system: { label: "系统", color: theme.assistant, markdown: false },
} satisfies Record<UIMessage["role"], { label: string; color: string; markdown: boolean }>;

export function getRoleDisplay(role: UIMessage["role"]) {
  return roleDisplay[role];
}

const activityLabels = {
  idle: "就绪",
  connecting: "连接模型...",
  awaiting: "等待内容...",
  reasoning: "正在推理...",
  generating: "正在生成回答...",
  failed: "请求失败",
} satisfies Record<Exclude<ChatActivity["phase"], "tool">, string>;

/** 状态行文案：区分连接、等待内容、推理、生成、工具调用与失败。 */
export function getActivityLabel(activity: ChatActivity) {
  return activity.phase === "tool"
    ? `工具${getToolStatus(activity.state)}`
    : activityLabels[activity.phase];
}
