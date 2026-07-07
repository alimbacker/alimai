import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ModelSelector from "../components/ModelSelector.jsx";
import ChatMessage from "../components/ChatMessage.jsx";
import Sidebar from "../components/Sidebar.jsx";
import WelcomeScreen from "../components/WelcomeScreen.jsx";
import BrainSelector from "../components/BrainSelector.jsx";
import BrainManager from "../components/BrainManager.jsx";
import ProfileMenu from "../components/ProfileMenu.jsx";
import { applyAppearance } from "../lib/theme.js";

export default function Chat({ onLogout }) {
  const [user, setUser] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);

  const [brains, setBrains] = useState([]);
  const [embeddings, setEmbeddings] = useState(true);
  const [routing, setRouting] = useState({ mode: "smart", brainId: null });

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [managerOpen, setManagerOpen] = useState(false);
  const [managerBrainId, setManagerBrainId] = useState(null);

  const bottomRef = useRef(null);
  const taRef = useRef(null);

  async function loadBrains() {
    const d = await api.getBrains();
    setBrains(d.brains);
    setEmbeddings(d.embeddings);
  }

  useEffect(() => {
    applyAppearance();
    api.me().then((d) => setUser(d.user)).catch(() => {});
    api.getModels().then((d) => {
      setModels(d.models);
      if (d.models.length > 0) setSelectedModel(d.models[0].id);
    });
    api.getConversations().then((d) => setConversations(d.conversations));
    loadBrains().catch(() => {});
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function autoGrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError("");
  }

  async function openConversation(id) {
    setActiveId(id);
    setError("");
    const { messages } = await api.getMessages(id);
    setMessages(messages);
  }

  // Send text (optionally overriding the brain, e.g. from a suggestion card).
  async function send(text, overrideRouting) {
    const content = (text ?? input).trim();
    if (!content || !selectedModel || sending) return;

    let convoId = activeId;
    if (!convoId) {
      const { id } = await api.createConversation(content.slice(0, 40));
      convoId = id;
      setActiveId(id);
      setConversations((prev) => [{ id, title: content.slice(0, 40), created_at: new Date().toISOString() }, ...prev]);
    }

    const userMessage = { id: `local-${Date.now()}`, role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setSending(true);
    setError("");

    const r = overrideRouting || routing;
    try {
      const { reply } = await api.sendMessage(convoId, content, selectedModel, {
        brainId: r.mode === "manual" ? r.brainId : undefined,
        routingMode: r.mode,
      });
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Suggestion card → pin that brain and ask.
  function pickSuggestion(text, brain) {
    const r = { mode: "manual", brainId: brain.id };
    setRouting(r);
    send(text, r);
  }

  async function handleFeedback(msgId, value) {
    if (!activeId) return;
    try { await api.sendFeedback(activeId, msgId, value, ""); } catch (e) { /* non-fatal */ }
  }

  const isAdmin = !!user?.is_admin;
  const initials = (user?.name || user?.email || "A").slice(0, 1).toUpperCase();

  return (
    <div className="app">
      <Sidebar
        user={user}
        brains={brains}
        conversations={conversations}
        activeId={activeId}
        onNewChat={newChat}
        onOpenConversation={openConversation}
        onManageBrains={() => { setManagerBrainId(null); setManagerOpen(true); }}
        onOpenBrain={(b) => { setManagerBrainId(b.id); setManagerOpen(true); }}
        onLogout={onLogout}
      />

      <main className="main">
        <header className="topbar">
          <div className="who">
            <div>
              <div className="name">{user?.name || "Alim AI"}</div>
              <div className="mail">{user?.email || ""}</div>
            </div>
          </div>
          <div className="topbar-right">
            <ModelSelector models={models} selected={selectedModel} onChange={setSelectedModel} />
            <ProfileMenu user={user} isAdmin={isAdmin} onLogout={onLogout} />
          </div>
        </header>

        {messages.length === 0 ? (
          <div className="messages">
            <WelcomeScreen
              brains={brains}
              onPick={pickSuggestion}
              onCreateBrain={() => { setManagerBrainId(null); setManagerOpen(true); }}
            />
          </div>
        ) : (
          <div className="messages">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                id={m.id}
                role={m.role}
                content={m.content}
                model={m.model}
                brain={m.brain}
                sources={m.sources}
                onFeedback={handleFeedback}
              />
            ))}
            {sending && (
              <div className="msg-row msg-row--assistant">
                <div className="msg-bubble"><div className="msg-content" style={{ color: "var(--muted)" }}>Thinking…</div></div>
              </div>
            )}
            {error && <div className="msg-row"><div className="chat-error">{error}</div></div>}
            <div ref={bottomRef} />
          </div>
        )}

        <div className="composer">
          <div className="composer-inner">
            <BrainSelector brains={brains} value={routing} onChange={setRouting} />
            <div className="input-row">
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoGrow(); }}
                onKeyDown={onKeyDown}
                placeholder="Message Alim AI…"
                disabled={sending}
              />
              <button className="send-btn" onClick={() => send()} disabled={sending || !input.trim()} title="Send">
                ➤
              </button>
            </div>
          </div>
        </div>
      </main>

      {managerOpen && (
        <BrainManager
          brains={brains}
          embeddings={embeddings}
          initialBrainId={managerBrainId}
          onClose={() => setManagerOpen(false)}
          onChanged={loadBrains}
        />
      )}
    </div>
  );
}
