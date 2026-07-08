import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import GoogleButton from "../components/GoogleButton.jsx";

export default function Register({ onAuth }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
      const { token } = await api.register(name, email, password);
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

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Join Alim AI with Google or an email and password.</p>

        <span className="auth-eyebrow">Login &amp; Registration</span>

        {error && <div className="auth-error">{error}</div>}

        <GoogleButton onToken={finishAuth} onError={setError} />

        <div className="auth-or"><span>or</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            placeholder="Name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <div className="auth-links auth-links--center">
          <span>Already have an account? <Link to="/login">Sign in</Link></span>
        </div>

        <p className="auth-foot">New users are guided through a quick setup.</p>
      </div>
    </div>
  );
}
