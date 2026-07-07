import { useEffect, useState } from "react";
import { api } from "../api.js";

// Modal for creating Brains and feeding them data (paste text or upload .txt/.md).
// This is the "teach the AI my data" surface. `embeddings` tells the user whether
// semantic search is on (OPENAI_API_KEY set) or keyword-only fallback.
export default function BrainManager({ brains, embeddings, initialBrainId, onClose, onChanged }) {
  const [selectedId, setSelectedId] = useState(initialBrainId || brains[0]?.id || null);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // create-brain form
  const [newEmoji, setNewEmoji] = useState("🧠");
  const [newName, setNewName] = useState("");

  // add-doc form
  const [tab, setTab] = useState("paste"); // paste | upload
  const [docTitle, setDocTitle] = useState("");
  const [docText, setDocText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const selected = brains.find((b) => b.id === selectedId);

  useEffect(() => {
    if (!selectedId) { setDocs([]); return; }
    setLoadingDocs(true);
    api.getDocuments(selectedId)
      .then((d) => setDocs(d.documents))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingDocs(false));
  }, [selectedId]);

  async function handleCreateBrain() {
    if (!newName.trim()) return;
    setError(""); setBusy(true);
    try {
      const { brain } = await api.createBrain(newName.trim(), newEmoji);
      setNewName(""); setNewEmoji("🧠");
      await onChanged();
      setSelectedId(brain.id);
      setToast(`Created ${brain.emoji} ${brain.name}`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function reindexNow() {
    if (!selected) return;
    setBusy(true); setError(""); setToast("");
    try {
      const r = await api.reindexBrain(selected.id);
      setToast(r.embedded
        ? `Re-indexed ${r.chunks} chunks with semantic embeddings`
        : `No embeddings key set — ${r.chunks} chunks kept in keyword mode`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function handleDeleteBrain() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}" and all its documents?`)) return;
    setBusy(true);
    try {
      await api.deleteBrain(selected.id);
      await onChanged();
      setSelectedId(brains.filter((b) => b.id !== selected.id)[0]?.id || null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setDocText(text);
    if (!docTitle) setDocTitle(file.name.replace(/\.[^.]+$/, ""));
    setTab("paste");
  }

  async function handleAddDoc() {
    if (!selectedId || !docText.trim()) return;
    setError(""); setToast(""); setBusy(true);
    try {
      const r = await api.addDocument(selectedId, docTitle || "Untitled", docText);
      setToast(
        `Added "${r.document.title}" — ${r.document.chunk_count} chunks` +
        (r.embedded ? " (semantic search)" : " (keyword search)")
      );
      setDocTitle(""); setDocText("");
      const d = await api.getDocuments(selectedId);
      setDocs(d.documents);
      await onChanged(); // refresh doc counts in sidebar
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function handleDeleteDoc(docId) {
    setBusy(true);
    try {
      await api.deleteDocument(selectedId, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      await onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🧠 Brains — your knowledge bases</h2>
          <button className="x" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {!embeddings && (
            <div className="hint warn">
              ⚠ No embeddings key set (<code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code>) —
              retrieval falls back to keyword matching. Add one on the server for
              semantic (meaning-based) search.
            </div>
          )}

          {/* pick / create brain */}
          <label className="field-label">Your brains</label>
          <div className="chip-brain-list">
            {brains.map((b) => (
              <button
                key={b.id}
                className={`brain-chip ${b.id === selectedId ? "active" : ""}`}
                onClick={() => setSelectedId(b.id)}
              >
                <span>{b.emoji}</span> {b.name} <span style={{ color: "var(--faint)" }}>· {b.doc_count}</span>
              </button>
            ))}
            {brains.length === 0 && <span className="hint">No brains yet — create one below.</span>}
          </div>

          <label className="field-label">Create a new brain</label>
          <div className="row-2">
            <input className="field" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} maxLength={2} />
            <input className="field" placeholder="e.g. Legal Brain" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateBrain()} />
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn-primary" disabled={busy || !newName.trim()} onClick={handleCreateBrain}>
              Create brain
            </button>
          </div>

          {selected && (
            <>
              <div className="divider" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label className="field-label" style={{ margin: 0 }}>
                  Add data to {selected.emoji} {selected.name}
                </label>
                <span style={{ display: "inline-flex", gap: 8 }}>
                  <button className="btn-reindex" onClick={reindexNow} disabled={busy}>↻ Re-index</button>
                  <button className="btn-line btn-danger-line" onClick={handleDeleteBrain}>Delete brain</button>
                </span>
              </div>

              <div className="mini-tabs" style={{ marginTop: 10 }}>
                <button className={`mini-tab ${tab === "paste" ? "active" : ""}`} onClick={() => setTab("paste")}>Paste text</button>
                <button className={`mini-tab ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>Upload .txt / .md</button>
              </div>

              {tab === "upload" ? (
                <input className="field" type="file" accept=".txt,.md,.markdown,.csv,text/*" onChange={handleFile} />
              ) : (
                <>
                  <input className="field" placeholder="Document title" value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)} style={{ marginBottom: 10 }} />
                  <textarea className="field" placeholder="Paste the content the AI should learn from…"
                    value={docText} onChange={(e) => setDocText(e.target.value)} />
                </>
              )}

              <div style={{ marginTop: 12 }}>
                <button className="btn-primary" disabled={busy || !docText.trim()} onClick={handleAddDoc}>
                  {busy ? "Indexing…" : "Add to brain"}
                </button>
              </div>

              {toast && <div className="toast">{toast}</div>}

              <label className="field-label" style={{ marginTop: 18 }}>
                Documents in this brain {loadingDocs ? "…" : `(${docs.length})`}
              </label>
              {docs.map((d) => (
                <div className="doc-item" key={d.id}>
                  <div>
                    <div className="t">📄 {d.title}</div>
                    <div className="m">{d.chunk_count} chunks · {d.source}</div>
                  </div>
                  <button className="rm" onClick={() => handleDeleteDoc(d.id)}>Remove</button>
                </div>
              ))}
              {!loadingDocs && docs.length === 0 && <div className="hint">No documents yet.</div>}
            </>
          )}

          {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
