import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

// Same client ID renders the button here and verifies the token on the server
// (GOOGLE_CLIENT_ID). Vite inlines VITE_* vars at BUILD time.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

// Renders Google's official "Continue with Google" button and exchanges the
// returned ID token for our JWT via /api/auth/google. Google's branding rules
// require using their rendered button, and it handles the OAuth popup for us.
// When no client ID is configured, shows a styled placeholder that explains the
// one setup step instead of a dead button.
export default function GoogleButton({ onToken, onError }) {
  const holderRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleCredential(resp) {
    setBusy(true);
    onError?.("");
    try {
      const { token } = await api.googleAuth(resp.credential);
      onToken(token);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const SCRIPT_ID = "google-gsi";

    const render = () => {
      if (!window.google?.accounts?.id || !holderRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      });
      holderRef.current.innerHTML = "";
      const width = Math.min(400, Math.max(240, holderRef.current.clientWidth || 340));
      window.google.accounts.id.renderButton(holderRef.current, {
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width,
      });
    };

    if (document.getElementById(SCRIPT_ID)) { render(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.id = SCRIPT_ID;
    s.onload = render;
    document.body.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        className="gbtn-fallback"
        onClick={() =>
          onError?.(
            "Google sign-in isn't set up yet. Add VITE_GOOGLE_CLIENT_ID (frontend build) and GOOGLE_CLIENT_ID (server), then redeploy."
          )
        }
      >
        <GoogleGlyph /> Continue with Google
      </button>
    );
  }

  return (
    <div className={`gbtn ${busy ? "is-busy" : ""}`}>
      <div ref={holderRef} />
      {busy && <div className="gbtn-busy">Signing in…</div>}
    </div>
  );
}
