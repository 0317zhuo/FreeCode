import { useAiTest } from "./useAiTest";

export function AiTestScreen({ onBack }: { onBack: () => void }) {
  const { content, errorMessage } = useAiTest();

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor="#000000"
      padding={2}
      gap={1}
    >
      <text>大模型返回测试 · DeepSeek</text>
      <scrollbox width="100%" flexGrow={1} minHeight={0} border focused>
        <text wrapMode="word">
          {content || (errorMessage ? "未收到模型输出。" : "正在等待 DeepSeek 返回...")}
        </text>
      </scrollbox>
      {errorMessage && (
        <text fg="#ff6b6b" flexShrink={0}>
          {errorMessage}
        </text>
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes use mouse handlers for terminal interactions. */}
      <box
        border
        height={3}
        flexShrink={0}
        paddingX={2}
        alignSelf="flex-start"
        onMouseDown={onBack}
      >
        <text>返回首页</text>
      </box>
    </box>
  );
}
