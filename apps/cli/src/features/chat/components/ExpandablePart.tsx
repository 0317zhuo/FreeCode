/** 单条工具记录：默认显示一行状态，展开查看输入输出，状态由上层控制。 */
import { type DynamicToolUIPart, getToolName, type ToolUIPart } from "ai";
import { theme } from "../../../lib/theme";
import { getToolStatus } from "../chatLabels";
import { formatDetail } from "../chatParts";

export function ExpandablePart({
  id,
  part,
  selected,
  expanded,
  onToggle,
}: {
  id: string;
  part: ToolUIPart | DynamicToolUIPart;
  selected: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const failed = part.state === "output-error" || part.state === "output-denied";
  const summary = `[工具: ${part.title ?? getToolName(part)}] ${getToolStatus(part.state)}`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions.
    <box id={id} width="100%" flexDirection="column" onMouseDown={() => onToggle(id)}>
      <text fg={failed ? theme.error : theme.tool} wrapMode="word">
        {selected ? "› " : ""}
        {summary}
      </text>
      {expanded && (
        <box paddingLeft={2} flexDirection="column">
          <text fg={theme.muted}>输入</text>
          <text fg={theme.muted} wrapMode="word">
            {formatDetail(
              part.state === "input-streaming" ? (part.rawInput ?? part.input) : part.input,
            )}
          </text>
          {part.state === "output-available" && (
            <>
              <text fg={theme.muted}>输出</text>
              <text fg={theme.muted} wrapMode="word">
                {formatDetail(part.output)}
              </text>
            </>
          )}
          {part.state === "output-error" && (
            <text fg={theme.error} wrapMode="word">
              错误 · {part.errorText}
            </text>
          )}
        </box>
      )}
    </box>
  );
}
