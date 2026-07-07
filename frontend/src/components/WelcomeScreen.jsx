// The HajiHaz-style landing view: title + suggestion cards grouped by Brain.
// If the user has no brains yet, we nudge them to create one.
export default function WelcomeScreen({ brains, onPick, onCreateBrain }) {
  const starters = [
    "Summarize the key points",
    "What are the main takeaways?",
    "Draft a short intro about this",
    "What questions should I ask?",
  ];

  return (
    <div className="welcome">
      <h1>Alim AI</h1>
      <p className="sub">Ask anything — your conversations are saved automatically. Try one of these:</p>

      {brains.length === 0 ? (
        <div className="welcome-empty">
          <div style={{ fontSize: 15, color: "var(--text)" }}>You don't have any Brains yet.</div>
          <p style={{ margin: "8px 0 0" }}>
            A <strong>Brain</strong> is a knowledge base built from your own documents. Add one,
            paste in your data, and Alim will answer from it.
          </p>
          <button onClick={onCreateBrain}>+ Create your first Brain</button>
        </div>
      ) : (
        <div className="suggest-grid">
          {brains.slice(0, 4).map((b) => (
            <div className="suggest-card" key={b.id}>
              <div className="cat"><span>{b.emoji}</span> {b.name}</div>
              {starters.slice(0, 2).map((s, i) => (
                <button
                  key={i}
                  className="suggest-btn"
                  onClick={() => onPick(`${s} from ${b.name}.`, b)}
                >
                  {s}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
