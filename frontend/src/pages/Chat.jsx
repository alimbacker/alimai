import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import TierSelector from "../components/TierSelector.jsx";
import ChatMessage from "../components/ChatMessage.jsx";
import Sidebar from "../components/Sidebar.jsx";
import WelcomeScreen from "../components/WelcomeScreen.jsx";
import BrainSelector from "../components/BrainSelector.jsx";
import BrainManager from "../components/BrainManager.jsx";
import ProfileMenu from "../components/ProfileMenu.jsx";
import { applyAppearance } from "../lib/theme.js";
import { speechSupported, startListening, speak, stopSpeaking } from "../lib/voice.js";

export default function Chat({ onLogout }) {
  const [user, setUser] = useState(null);
  const [tiers, setTiers] = useState(["low", "medium", "high"]);
  const [tier, setTier] = useState("medium");
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

  // JARVIS-style assistant: agent tools + optional voice in/out.
  const [assistantMode, setAssistantMode] = useState(
    () => localStorage.getItem("assistantMode") === "1"
  );
  const [voiceOut, setVoiceOut] = useState(
    () => localStorage.getItem("voiceOut") === "1"
  );
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const stopListenRef = useRef(null);
  const voiceSupported = speechSupported();

  useEffect(() => { localStorage.setItem("assistantMode", assistantMode ? "1" : "0"); }, [assistantMode]);
  useEffect(() => { localStorage.setItem("voiceOut", voiceOut ? "1" : "0"); }, [voiceOut]);

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
    api.getTiers().then((d) => { if (d.tiers?.length) setTiers(d.tiers); }).catch(() => {});
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

  async function deleteChat(id) {
    if (!confirm("Delete this chat? This can't be undone.")) return;
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) { setActiveId(null); setMessages([]); }
    } catch (err) {
      setError(err.message);
    }
  }

  // Send text (optionally overriding the brain, e.g. from a suggestion card).
  async function send(text, overrideRouting) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

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
      const { reply } = await api.sendMessage(convoId, content, tier, {
        brainId: r.mode === "manual" ? r.brainId : undefined,
        routingMode: r.mode,
        agent: assistantMode,
      });
      setMessages((prev) => [...prev, reply]);
      if (voiceOut && reply?.content) {
        setSpeaking(true);
        speak(reply.content, { onEnd: () => setSpeaking(false) });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  // Push-to-talk: toggle the mic. On a final transcript, auto-send it.
  function toggleMic() {
    if (listening) {
      stopListenRef.current?.();
      setListening(false);
      return;
    }
    stopSpeaking();
    setSpeaking(false);
    setError("");
    setListening(true);
    stopListenRef.current = startListening({
      interim: true,
      onResult: (text, isFinal) => {
        setInput(text);
        if (isFinal && text.trim()) {
          setListening(false);
          send(text);
        }
      },
      onEnd: () => setListening(false),
      onError: (msg) => { setError(msg); setListening(false); },
    });
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

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

  return (
    <div className="app">
      <Sidebar
        user={user}
        brains={brains}
        conversations={conversations}
        activeId={activeId}
        onNewChat={newChat}
        onOpenConversation={openConversation}
        onDeleteConversation={deleteChat}
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
            <TierSelector value={tier} onChange={setTier} tiers={tiers} />
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
                web={m.web}
                agent={m.agent}
                actions={m.actions}
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
            <div className="assist-bar">
              <button
                className={`chip-toggle ${assistantMode ? "on" : ""}`}
                onClick={() => setAssistantMode((v) => !v)}
                title="Let Alim take real actions: send email, manage your files, search the web"
              >
                ⚡ Assistant
              </button>
              {voiceSupported && (
                <button
                  className={`chip-toggle ${voiceOut ? "on" : ""}`}
                  onClick={() => { if (voiceOut) { stopSpeaking(); setSpeaking(false); } setVoiceOut((v) => !v); }}
                  title="Read replies aloud"
                >
                  🔊 Voice
                </button>
              )}
              {speaking && (
                <button className="chip-toggle stop" onClick={() => { stopSpeaking(); setSpeaking(false); }}>
                  ◼ Stop
                </button>
              )}
              {!assistantMode && <BrainSelector brains={brains} value={routing} onChange={setRouting} />}
              {assistantMode && <span className="assist-hint">Actions on · email, files &amp; web</span>}
            </div>
            <div className="input-row">
              {voiceSupported && (
                <button
                  className={`mic-btn ${listening ? "live" : ""}`}
                  onClick={toggleMic}
                  disabled={sending}
                  title={listening ? "Stop listening" : "Speak"}
                >
                  🎤
                </button>
              )}
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoGrow(); }}
                onKeyDown={onKeyDown}
                placeholder={listening ? "Listening…" : assistantMode ? "Ask Alim to do something…" : "Message Alim AI…"}
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
