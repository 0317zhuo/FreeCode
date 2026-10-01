import {
  type ChatStatus,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";

/** 助手回复当前所处的阶段，供状态行、消息区与输入框共同消费。 */
export type ChatActivity =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "awaiting" }
  | { phase: "reasoning" }
  | { phase: "generating" }
  | { phase: "tool"; state: ToolUIPart["state"] }
  | { phase: "failed" };

/** 请求是否仍在进行，用于禁用提交并判断内容是否还在流式输出。 */
export function isChatBusy(status: ChatStatus) {
  return status === "submitted" || status === "streaming";
}

const finishedToolStates: ReadonlySet<ToolUIPart["state"]> = new Set([
  "output-available",
  "output-error",
  "output-denied",
]);

/**
 * 片段自身是否仍在进行。文本与推理以必达的 done 状态为准，
 * 工具调用以是否为终态为准；状态缺失视为仍在进行。
 */
function isActivePart(part: UIMessage["parts"][number]) {
  if (isToolUIPart(part)) return !finishedToolStates.has(part.state);
  if (isTextUIPart(part) || isReasoningUIPart(part)) return part.state !== "done";
  return false;
}

/**
 * 从消息与连接状态派生当前阶段。
 * 只看最后一个 step 的片段，并以片段自身状态判断是否仍在进行，
 * 避免把已完成的内容误报为正在生成。
 */
export function deriveChatActivity(messages: UIMessage[], status: ChatStatus): ChatActivity {
  if (status === "ready") return { phase: "idle" };
  if (status === "error") return { phase: "failed" };
  if (status === "submitted") return { phase: "connecting" };

  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== "assistant") return { phase: "awaiting" };

  const lastStepStartIndex = lastMessage.parts.findLastIndex((part) => part.type === "step-start");
  const activePart = lastMessage.parts.slice(lastStepStartIndex + 1).findLast(isActivePart);
  if (!activePart) return { phase: "awaiting" };
  if (isToolUIPart(activePart)) return { phase: "tool", state: activePart.state };
  if (isReasoningUIPart(activePart)) return { phase: "reasoning" };
  if (isTextUIPart(activePart)) return { phase: "generating" };
  return { phase: "awaiting" };
}
