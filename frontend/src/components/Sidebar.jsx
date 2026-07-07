// Left rail: New Chat, search, Brains list, recent chats grouped by time.
export default function Sidebar({
  user, brains, conversations, activeId,
  onNewChat, onOpenConversation, onManageBrains, onOpenBrain, onLogout,
}) {
  const [today, older] = groupByTime(conversations);
  return (
    <aside className="sidebar">
      <button className="sidebar-new" onClick={onNewChat}>＋ New Chat</button>

      <div className="sidebar-search">
        🔍 <input placeholder="Search..." disabled />
      </div>

      <div className="sidebar-scroll">
        <div className="sb-section-head">
          <span>Brains</span>
          <button className="sb-add" title="Manage brains" onClick={onManageBrains}>＋</button>
        </div>
        {brains.length === 0 && <div className="sb-empty">No brains yet</div>}
        {brains.map((b) => (
          <button key={b.id} className="brain-row" onClick={() => onOpenBrain(b)}>
            <span className="emoji">{b.emoji}</span>
            <span>{b.name}</span>
            <span className="count">{b.doc_count}</span>
          </button>
        ))}

        <div className="sb-section-head"><span>Recent Chats</span></div>
        {conversations.length === 0 && <div className="sb-empty">Nothing yet</div>}
        {today.length > 0 && <div className="time-label">Today</div>}
        {today.map((c) => (
          <ConvoRow key={c.id} c={c} active={c.id === activeId} onClick={() => onOpenConversation(c.id)} />
        ))}
        {older.length > 0 && <div className="time-label">Older</div>}
        {older.map((c) => (
          <ConvoRow key={c.id} c={c} active={c.id === activeId} onClick={() => onOpenConversation(c.id)} />
        ))}
      </div>

      <div className="sidebar-foot">
        <span className="who">{user?.email || "Signed in"}</span>
        <button className="btn-ghost" onClick={onLogout}>Log out</button>
      </div>
    </aside>
  );
}

function ConvoRow({ c, active, onClick }) {
  return (
    <button className={`convo-row ${active ? "convo-row--active" : ""}`} onClick={onClick}>
      <span className="dot">💬</span> {c.title}
    </button>
  );
}

function groupByTime(convos) {
  const today = [], older = [];
  const now = Date.now();
  for (const c of convos) {
    const t = c.created_at ? Date.parse(c.created_at + "Z") || Date.parse(c.created_at) : now;
    if (now - t < 24 * 3600 * 1000) today.push(c);
    else older.push(c);
  }
  return [today, older];
}
