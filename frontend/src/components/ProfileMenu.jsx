import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAppearance, applyAppearance } from "../lib/theme.js";

// Top-right avatar dropdown: profile, admin portal (admins only), appearance, sign out.
export default function ProfileMenu({ user, isAdmin, onLogout }) {
  const [open, setOpen] = useState(false);
  const [appearance, setAppearance] = useState(getAppearance());
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const initials = (user?.name || user?.email || "A").slice(0, 1).toUpperCase();
  const setPref = (p) => { setAppearance(p); applyAppearance(p); };

  return (
    <div className="profile-menu" ref={ref}>
      <button className="avatar avatar-btn" onClick={() => setOpen((o) => !o)}>{initials}</button>
      {open && (
        <div className="profile-dropdown">
          <div className="pd-name">{user?.name || "Account"}</div>
          <button className="pd-item" onClick={() => { setOpen(false); navigate("/profile"); }}>
            <span className="pd-ico">👤</span> My Profile
          </button>
          {isAdmin && (
            <button className="pd-item" onClick={() => { setOpen(false); navigate("/admin"); }}>
              <span className="pd-ico">🛡️</span> Admin Portal
            </button>
          )}
          <div className="pd-sep" />
          <div className="pd-label">Appearance</div>
          <div className="pd-appearance">
            {[["light", "☀ Light"], ["system", "💻 System"], ["dark", "🌙 Dark"]].map(([k, label]) => (
              <button
                key={k}
                className={`pd-app-btn ${appearance === k ? "active" : ""}`}
                onClick={() => setPref(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="pd-sep" />
          <button className="pd-item pd-danger" onClick={onLogout}>
            <span className="pd-ico">⎋</span> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
