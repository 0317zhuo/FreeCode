export function PromptTextarea() {
  return (
    <box width="100%" padding={1} backgroundColor="#111111">
      <box
        width="100%"
        height={14}
        border
        borderStyle="single"
        borderColor="#454545"
        padding={1}
        backgroundColor="#0b0b0b"
      >
        <textarea
          width="100%"
          height="100%"
          placeholder="Describe the app, task, or command you want to build..."
          focused
          wrapMode="word"
          backgroundColor="#0b0b0b"
          textColor="#e5e5e5"
          cursorColor="#f5f5f5"
          focusedBackgroundColor="#0b0b0b"
          placeholderColor="#777777"
        />
      </box>
    </box>
  );
}
