import { useState } from "react";

export default function ChatMessage({ role, content, model, brain, sources, id, onFeedback }) {
  const isUser = role === "user";
  const [vote, setVote] = useState(null);

  const send = (v) => {
    const next = vote === v ? null : v; // toggle
    setVote(next);
    if (next && onFeedback) onFeedback(id, next);
  };

  return (
    <div className={`msg-row ${isUser ? "msg-row--user" : "msg-row--assistant"}`}>
      <div className="msg-bubble">
        {!isUser && (model || brain) && (
          <div className="msg-model-tag">
            {brain ? `${brain.emoji || "🧠"} ${brain.name}` : model}
          </div>
        )}
        <div className="msg-content">{content}</div>
        {!isUser && sources && sources.length > 0 && (
          <div className="msg-sources">
            <span className="lbl">Sources:</span>
            {[...new Set(sources)].map((s, i) => <span className="src-chip" key={i}>{s}</span>)}
          </div>
        )}
        {!isUser && id && !String(id).startsWith("local-") && onFeedback && (
          <div className="msg-feedback">
            <button className={`fb ${vote === 1 ? "up" : ""}`} onClick={() => send(1)} title="Helpful">👍</button>
            <button className={`fb ${vote === -1 ? "down" : ""}`} onClick={() => send(-1)} title="Not helpful">👎</button>
          </div>
        )}
      </div>
    </div>
  );
}
