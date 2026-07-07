import { useState, useRef, useEffect } from "react";

// The pill above the input. Mirrors HajiHaz's routing menu:
//   Smart  = auto-route across all brains
//   Manual = pin one specific brain
// value: { mode: "smart"|"manual"|"none", brainId }
export default function BrainSelector({ brains, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const active = brains.find((b) => b.id === value.brainId);
  let label = "Smart · Auto-route";
  let smartLook = true;
  if (value.mode === "none") { label = "No Brain"; }
  else if (value.mode === "manual" && active) { label = `${active.emoji} ${active.name}`; smartLook = false; }

  const pick = (v) => { onChange(v); setOpen(false); };

  return (
    <div className="brain-pill-wrap" ref={ref}>
      <button
        className={`brain-pill ${smartLook && value.mode !== "none" ? "smart" : ""}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {value.mode === "smart" ? "✨" : value.mode === "none" ? "○" : "🧠"} {label} ▾
      </button>

      {open && (
        <div className="brain-menu">
          <button className="brain-menu-item" onClick={() => pick({ mode: "smart", brainId: null })}>
            ✨ Smart <span className="meta">Auto-route</span>
            {value.mode === "smart" && <span className="check">✓</span>}
          </button>
          <button className="brain-menu-item" onClick={() => pick({ mode: "none", brainId: null })}>
            ○ No Brain <span className="meta">Plain chat</span>
            {value.mode === "none" && <span className="check">✓</span>}
          </button>

          {brains.length > 0 && <div className="brain-menu-sep" />}
          {brains.length > 0 && <div className="brain-menu-head">Pick a brain</div>}
          {brains.map((b) => (
            <button
              key={b.id}
              className="brain-menu-item"
              onClick={() => pick({ mode: "manual", brainId: b.id })}
            >
              <span>{b.emoji}</span> {b.name}
              <span className="meta">{b.doc_count} docs</span>
              {value.mode === "manual" && value.brainId === b.id && <span className="check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
