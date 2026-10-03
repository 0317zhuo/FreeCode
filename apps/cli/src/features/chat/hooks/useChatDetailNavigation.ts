import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useRef, useState } from "react";

/**
 * 消息记录区的焦点与详情展开状态：
 * Shift+Tab 切换焦点，j/k 移动选择，Enter 展开或收起，并把选中项滚动进可视区。
 */
export function useChatDetailNavigation(detailIds: string[]) {
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const [focusMessages, setFocusMessages] = useState(false);
  const [selectedDetailId, setSelectedDetailId] = useState<string>();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const activeDetailId =
    selectedDetailId && detailIds.includes(selectedDetailId) ? selectedDetailId : detailIds.at(-1);

  useKeyboard((key) => {
    if (key.name === "tab" && key.shift && !key.ctrl && !key.meta && !key.super) {
      key.preventDefault();
      setFocusMessages((value) => !value);
      return;
    }
    if (!focusMessages || key.ctrl || key.meta || key.shift || detailIds.length === 0) return;

    if (key.name === "j" || key.name === "k") {
      const index = detailIds.indexOf(activeDetailId ?? "");
      const nextIndex =
        key.name === "j" ? Math.min(index + 1, detailIds.length - 1) : Math.max(index - 1, 0);
      setSelectedDetailId(detailIds[nextIndex]);
    }
    if (key.name === "return" || key.name === "kpenter" || key.name === "linefeed") {
      if (activeDetailId) toggleDetail(activeDetailId);
    }
  });

  useEffect(() => {
    if (focusMessages && activeDetailId) scrollRef.current?.scrollChildIntoView(activeDetailId);
  }, [focusMessages, activeDetailId]);

  function toggleDetail(id: string) {
    setFocusMessages(true);
    setSelectedDetailId(id);
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return { scrollRef, focusMessages, activeDetailId, expandedIds, toggleDetail };
}
