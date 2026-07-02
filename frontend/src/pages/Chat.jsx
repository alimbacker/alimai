import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ModelSelector from "../components/ModelSelector.jsx";
import ChatMessage from "../components/ChatMessage.jsx";

export default function Chat({ onLogout }) {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    api.getModels().then((d) => {
      setModels(d.models);
      if (d.models.length > 0) setSelectedModel(d.models[0].id);
    });
    api.getConversations().then((d) => setConversations(d.conversations));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function startNewConversation() {
    const { id } = await api.createConversation("New chat");
    setConversations((prev) => [{ id, title: "New chat" }, ...prev]);
    setActiveId(id);
    setMessages([]);
  }

  async function openConversation(id) {
    setActiveId(id);
    const { messages } = await api.getMessages(id);
    setMessages(messages);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !selectedModel) return;

    let convoId = activeId;
    if (!convoId) {
      const { id } = await api.createConversation(input.slice(0, 40));
      convoId = id;
      setActiveId(id);
      setConversations((prev) => [{ id, title: input.slice(0, 40) }, ...prev]);
    }

    const userMessage = { id: `local-${Date.now()}`, role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);
    setError("");

    try {
      const { reply } = await api.sendMessage(convoId, userMessage.content, selectedModel);
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="brand">Alim AI</span>
          <button className="btn-ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
        <button className="btn-new-chat" onClick={startNewConversation}>
          + New chat
        </button>
        <div className="convo-list">
          {conversations.map((c) => (
            <button
              key={c.id}
              className={`convo-item ${c.id === activeId ? "convo-item--active" : ""}`}
              onClick={() => openConversation(c.id)}
            >
              {c.title}
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <ModelSelector models={models} selected={selectedModel} onChange={setSelectedModel} />
        </header>

        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">Start a conversation below.</div>
          )}
          {messages.map((m) => (
            <ChatMessage key={m.id} role={m.role} content={m.content} model={m.model} />
          ))}
          {error && <div className="chat-error">{error}</div>}
          <div ref={bottomRef} />
        </div>

        <form className="chat-input-row" onSubmit={handleSend}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Alim AI..."
            disabled={sending}
          />
          <button type="submit" disabled={sending || !input.trim()}>
            {sending ? "..." : "Send"}
          </button>
        </form>
      </main>
    </div>
  );
}
