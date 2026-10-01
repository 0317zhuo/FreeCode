import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { theme } from "../../lib/theme";
import { useConversationHistory } from "./hooks/useConversationHistory";

export function HistoryScreen({
  onOpen,
  onBack,
}: {
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const { items, error } = useConversationHistory();
  const [selected, setSelected] = useState(0);
  useKeyboard((key) => {
    if (key.name === "up") setSelected((value) => Math.max(0, value - 1));
    if (key.name === "down") setSelected((value) => Math.min((items?.length ?? 1) - 1, value + 1));
    if (key.name === "return" && items?.[selected]) onOpen(items[selected].id);
    if (key.name === "backspace") onBack();
  });
  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} gap={1}>
      <text fg={theme.foreground}>历史对话 · 最近 50 条</text>
      <scrollbox flexGrow={1} focused>
        {error ? (
          <text fg={theme.error}>{error.message}</text>
        ) : !items ? (
          <text>正在加载…</text>
        ) : !items.length ? (
          <text>暂无历史对话。</text>
        ) : (
          items.map((item, index) => (
            <text key={item.id} fg={index === selected ? theme.foreground : theme.muted}>
              {index === selected ? "› " : "  "}
              {item.title || "新对话"}
            </text>
          ))
        )}
      </scrollbox>
      <text fg={theme.muted}>↑/↓ 选择 · Enter 打开 · Backspace 返回首页 · Q 退出</text>
    </box>
  );
}
