import { useEffect, useState } from "react";
import { api } from "../api.js";
import { extractText, isSupported } from "../lib/extractText.js";

// Admin-managed, shared knowledge base. Brains created here are global — every
// user's chat can retrieve from them. Upload documents as files (.txt .md .csv
// .json .html … and .pdf, parsed in-browser) or paste text.
export default function AdminKnowledge() {
  const [brains, setBrains] = useState([]);
  const [embeddings, setEmbeddings] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [docs, setDocs] = useState([]);

  const [newEmoji, setNewEmoji] = useState("🧠");
  const [newName, setNewName] = useState("");

  const [tab, setTab] = useState("upload"); // upload | paste
  const [docTitle, setDocTitle] = useState("");
  const [docText, setDocText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const selected = brains.find((b) => b.id === selectedId);

  async function loadBrains() {
    const d = await api.adminGetBrains();
    setBrains(d.brains);
    setEmbeddings(d.embeddings);
    if (!selectedId && d.brains[0]) setSelectedId(d.brains[0].id);
  }
  useEffect(() => { loadBrains().catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!selectedId) { setDocs([]); return; }
    api.adminGetDocuments(selectedId).then((d) => setDocs(d.documents)).catch((e) => setError(e.message));
  }, [selectedId]);

  async function createBrain() {
    if (!newName.trim()) return;
    setBusy(true); setError("");
    try {
      const { brain } = await api.adminCreateBrain(newName.trim(), newEmoji);
      setNewName(""); setNewEmoji("🧠");
      await loadBrains();
      setSelectedId(brain.id);
      setToast(`Created shared brain ${brain.emoji} ${brain.name}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function deleteBrain() {
    if (!selected || !confirm(`Delete "${selected.name}" and all its documents?`)) return;
    setBusy(true);
    try {
      await api.adminDeleteBrain(selected.id);
      setSelectedId(null);
      await loadBrains();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  // Upload one or more files: extract text in-browser, then index each.
  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file
    if (!files.length || !selectedId) return;
    setError(""); setToast(""); setBusy(true);
    let added = 0;
    try {
      for (const file of files) {
        if (!isSupported(file)) { setError(`Unsupported file type: ${file.name}`); continue; }
        setProgress(`Reading ${file.name}…`);
        let text;
        try { text = await extractText(file); }
        catch (err) { setError(`${file.name}: ${err.message}`); continue; }
        if (!text) { setError(`${file.name}: no text found`); continue; }
        setProgress(`Indexing ${file.name}…`);
        const r = await api.adminAddDocument(selectedId, file.name.replace(/\.[^.]+$/, ""), text, "file");
        added += 1;
        setToast(`Indexed "${r.document.title}" — ${r.document.chunk_count} chunks` + (r.embedded ? " (semantic)" : " (keyword)"));
      }
      const d = await api.adminGetDocuments(selectedId); setDocs(d.documents);
      await loadBrains();
      if (added) setProgress(`Done — ${added} file(s) added.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); setProgress(""); }
  }

  async function addPaste() {
    if (!selectedId || !docText.trim()) return;
    setBusy(true); setError(""); setToast("");
    try {
      const r = await api.adminAddDocument(selectedId, docTitle || "Untitled", docText, "paste");
      setToast(`Indexed "${r.document.title}" — ${r.document.chunk_count} chunks` + (r.embedded ? " (semantic)" : " (keyword)"));
      setDocTitle(""); setDocText("");
      const d = await api.adminGetDocuments(selectedId); setDocs(d.documents);
      await loadBrains();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function deleteDoc(docId) {
    setBusy(true);
    try {
      await api.adminDeleteDocument(selectedId, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      await loadBrains();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      {!embeddings && (
        <div className="hint warn" style={{ marginBottom: 14 }}>
          ⚠ No embeddings key set (GEMINI_API_KEY or OPENAI_API_KEY) — uploads are indexed for
          keyword search. Add a key on the server for semantic search.
        </div>
      )}

      <div className="knowledge-grid">
        {/* left: brain list + create */}
        <div className="panel sub">
          <div className="panel-title">Shared brains ({brains.length})</div>
          {brains.map((b) => (
            <button key={b.id} className={`kb-brain ${b.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(b.id)}>
              <span>{b.emoji} {b.name}</span>
              <span className="muted-inline">{b.doc_count} docs</span>
            </button>
          ))}
          {brains.length === 0 && <div className="hint">No brains yet — create one.</div>}

          <div className="divider" />
          <label className="field-label">New shared brain</label>
          <div className="row-2">
            <input className="field" value={newEmoji} maxLength={2} onChange={(e) => setNewEmoji(e.target.value)} />
            <input className="field" placeholder="e.g. Company Handbook" value={newName}
              onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createBrain()} />
          </div>
          <button className="btn-primary" style={{ marginTop: 10 }} disabled={busy || !newName.trim()} onClick={createBrain}>
            Create brain
          </button>
        </div>

        {/* right: upload + documents */}
        <div className="panel sub">
          {!selected ? (
            <div className="hint">Select or create a brain to add data.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="panel-title" style={{ margin: 0 }}>{selected.emoji} {selected.name}</div>
                <button className="btn-line btn-danger-line" onClick={deleteBrain}>Delete brain</button>
              </div>

              <div className="mini-tabs" style={{ marginTop: 12 }}>
                <button className={`mini-tab ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>Upload files</button>
                <button className={`mini-tab ${tab === "paste" ? "active" : ""}`} onClick={() => setTab("paste")}>Paste text</button>
              </div>

              {tab === "upload" ? (
                <div>
                  <label className="file-drop">
                    <input type="file" multiple accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.log,.xml,.yaml,.yml,.pdf,text/*" onChange={handleFiles} />
                    <div className="file-drop-inner">
                      <div style={{ fontSize: 26 }}>⬆️</div>
                      <div>Click to choose files</div>
                      <div className="hint">PDF, TXT, MD, CSV, JSON, HTML — you can pick several at once.</div>
                    </div>
                  </label>
                  {progress && <div className="hint" style={{ marginTop: 8 }}>{progress}</div>}
                </div>
              ) : (
                <div>
                  <input className="field" placeholder="Document title" value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)} style={{ marginBottom: 10 }} />
                  <textarea className="field" placeholder="Paste content to add to this brain…"
                    value={docText} onChange={(e) => setDocText(e.target.value)} />
                  <button className="btn-primary" style={{ marginTop: 10 }} disabled={busy || !docText.trim()} onClick={addPaste}>
                    {busy ? "Indexing…" : "Add to brain"}
                  </button>
                </div>
              )}

              {toast && <div className="toast" style={{ marginTop: 10 }}>{toast}</div>}

              <label className="field-label" style={{ marginTop: 16 }}>Documents ({docs.length})</label>
              {docs.map((d) => (
                <div className="doc-item" key={d.id}>
                  <div>
                    <div className="t">📄 {d.title}</div>
                    <div className="m">{d.chunk_count} chunks · {d.source}</div>
                  </div>
                  <button className="rm" onClick={() => deleteDoc(d.id)}>Remove</button>
                </div>
              ))}
              {docs.length === 0 && <div className="hint">No documents yet.</div>}
            </>
          )}
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
