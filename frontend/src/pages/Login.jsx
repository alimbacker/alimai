import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import GoogleButton from "../components/GoogleButton.jsx";

export default function Login({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();

  function finishAuth(token) {
    onAuth(token);
    navigate("/");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token } = await api.login(email, password);
      finishAuth(token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <span className="auth-brand">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2l1.9 5.6L19.5 9l-4 3.9 1 6.1L12 16.8 7.5 19l1-6.1L4.5 9l5.6-1.4L12 2z" fill="currentColor"/>
          </svg>
          Alim AI
        </span>

        <h1 className="auth-title">Welcome to Alim AI</h1>
        <p className="auth-sub">Sign in or create your account with Google.</p>

        <span className="auth-eyebrow">Login &amp; Registration</span>

        {error && <div className="auth-error">{error}</div>}

        <GoogleButton onToken={finishAuth} onError={setError} />

        <div className="auth-or"><span>or</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/register">Create an account</Link>
          <button type="button" className="linklike" onClick={() => setShowForgot((v) => !v)}>
            Forgot password?
          </button>
        </div>
        {showForgot && (
          <p className="auth-note">
            Password resets are handled by an administrator — reach out and they can
            issue you a temporary password.
          </p>
        )}

        <p className="auth-foot">New here? Creating an account takes a few seconds.</p>
      </div>
    </div>
  );
}
