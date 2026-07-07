import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Strip stray HTML line-break tags the model sometimes emits inside tables,
// so they don't render as literal "<br>".
function clean(text) {
  return (text || "").replace(/<br\s*\/?>/gi, " ");
}

export default function ChatMessage({ role, content, brain, sources, id, onFeedback }) {
  const isUser = role === "user";
  const [vote, setVote] = useState(null);

  const send = (v) => {
    const next = vote === v ? null : v;
    setVote(next);
    if (next && onFeedback) onFeedback(id, next);
  };

  const hasSources = !isUser && sources && sources.length > 0;

  return (
    <div className={`msg-row ${isUser ? "msg-row--user" : "msg-row--assistant"}`}>
      <div className="msg-bubble">
        {!isUser && (
          <div className="msg-model-tag">
            {brain ? `${brain.emoji || "🧠"} ${brain.name}` : "Alim AI"}
            {!brain && <span className="tag-general"> · general knowledge</span>}
          </div>
        )}

        {isUser ? (
          <div className="msg-content">{content}</div>
        ) : (
          <div className="msg-content md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{clean(content)}</ReactMarkdown>
          </div>
        )}

        {hasSources && (
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
