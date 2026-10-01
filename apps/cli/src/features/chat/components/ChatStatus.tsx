/** 聊天状态条：一行显示当前活动，请求失败时改为错误提示。 */
import { theme } from "../../../lib/theme";
import type { ChatActivity } from "../chatActivity";
import { getActivityLabel } from "../chatLabels";

export function ChatStatus({
  activity,
  error,
}: {
  activity: ChatActivity;
  error: Error | undefined;
}) {
  if (error) {
    return (
      <text fg={theme.error} wrapMode="word">
        系统 · 请求失败：{error.message}
      </text>
    );
  }

  if (activity.phase === "failed") {
    return (
      <text fg={theme.error} wrapMode="word">
        系统 · 请求失败
      </text>
    );
  }

  return <text fg={theme.muted}>状态 · {getActivityLabel(activity)}</text>;
}
