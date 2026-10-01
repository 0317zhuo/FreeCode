import type { TextareaOptions, TextareaRenderable } from "@opentui/core";
import { promptSchema } from "./promptSchema";

/**
 * 首页输入框与聊天输入框共用的按键契约：
 * 无修饰键 Enter 提交，Shift/Meta+Enter 换行。
 */
export const promptKeyBindings = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "linefeed", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "kpenter", shift: true, action: "newline" },
  { name: "linefeed", shift: true, action: "newline" },
  { name: "return", meta: true, action: "newline" },
  { name: "kpenter", meta: true, action: "newline" },
] satisfies TextareaOptions["keyBindings"];

/** 校验并规范化输入框内容；空白内容返回 undefined，调用方不应提交。 */
export function readPrompt(textarea: TextareaRenderable | null) {
  const result = promptSchema.safeParse(textarea?.plainText);
  return result.success ? result.data : undefined;
}
