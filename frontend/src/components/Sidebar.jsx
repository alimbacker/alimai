// Left rail: New Chat, search, Brains list, recent chats grouped by time.
export default function Sidebar({
  user, brains, conversations, activeId,
  onNewChat, onOpenConversation, onDeleteConversation, onManageBrains, onOpenBrain, onLogout,
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
            {b.is_global ? <span className="shared-tag" title="Shared knowledge">shared</span> : null}
            <span className="count">{b.doc_count}</span>
          </button>
        ))}

        <div className="sb-section-head"><span>Recent Chats</span></div>
        {conversations.length === 0 && <div className="sb-empty">Nothing yet</div>}
        {today.length > 0 && <div className="time-label">Today</div>}
        {today.map((c) => (
          <ConvoRow key={c.id} c={c} active={c.id === activeId}
            onOpen={() => onOpenConversation(c.id)} onDelete={() => onDeleteConversation(c.id)} />
        ))}
        {older.length > 0 && <div className="time-label">Older</div>}
        {older.map((c) => (
          <ConvoRow key={c.id} c={c} active={c.id === activeId}
            onOpen={() => onOpenConversation(c.id)} onDelete={() => onDeleteConversation(c.id)} />
        ))}
      </div>

      <div className="sidebar-foot">
        <span className="who">{user?.email || "Signed in"}</span>
        <button className="btn-ghost" onClick={onLogout}>Log out</button>
      </div>
    </aside>
  );
}

function ConvoRow({ c, active, onOpen, onDelete }) {
  return (
    <div className={`convo-row ${active ? "convo-row--active" : ""}`}>
      <button className="convo-open" onClick={onOpen} title={c.title}>
        <span className="dot">💬</span>
        <span className="convo-title">{c.title}</span>
      </button>
      <button
        className="convo-del"
        title="Delete chat"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >🗑</button>
    </div>
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
