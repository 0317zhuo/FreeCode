import { isToolUIPart, type UIMessage } from "ai";

/** 可展开的工具调用片段 ID；推理直接显示在消息中。 */
export function getDetailIds(messages: UIMessage[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part, index) => (isToolUIPart(part) ? [`${message.id}:${index}`] : [])),
  );
}

/** 把片段内容渲染成可读文本，对象与数组统一转成 JSON。 */
export function formatDetail(value: unknown) {
  if (value === undefined) return "暂无";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}
