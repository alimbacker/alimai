export default function ChatMessage({ role, content, model }) {
  const isUser = role === "user";
  return (
    <div className={`msg-row ${isUser ? "msg-row--user" : "msg-row--assistant"}`}>
      <div className="msg-bubble">
        {!isUser && model && <div className="msg-model-tag">{model}</div>}
        <div className="msg-content">{content}</div>
      </div>
    </div>
  );
}
