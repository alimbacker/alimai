import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import BarChart from "../components/BarChart.jsx";
import AdminKnowledge from "../components/AdminKnowledge.jsx";

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const TABS = ["Overview", "Knowledge", "Users", "Admins"];

export default function Admin({ onLogout }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");

  const [aEmail, setAEmail] = useState("");
  const [aPass, setAPass] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadAll() {
    try {
      const [s, a, u, ad] = await Promise.all([
        api.getAdminStats(), api.getAdminAnalytics(), api.getAdminUsers(), api.getAdmins(),
      ]);
      setStats(s.stats); setAnalytics(a); setUsers(u.users); setAdmins(ad.admins);
    } catch (e) {
      setError(e.message);
      if (/admin access|403/i.test(e.message)) setTimeout(() => navigate("/"), 1500);
    }
  }
  useEffect(() => { loadAll(); }, []);

  async function doSearch(e) {
    e?.preventDefault();
    try { setUsers((await api.getAdminUsers(search)).users); } catch (e) { setError(e.message); }
  }

  function exportCsv() {
    const header = ["email", "name", "status", "admin", "joined", "last_login"];
    const rows = users.map((u) => [u.email, u.name || "", u.status || "active", u.is_admin ? "yes" : "no", u.created_at || "", u.last_login || "never"]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = "alim-users.csv"; link.click();
  }

  async function changeStatus(u, status) {
    try { await api.setUserStatus(u.id, status); setBanner(`${u.email} → ${status}`); loadAll(); } catch (e) { setError(e.message); }
  }
  async function resetPw(u) {
    try { const r = await api.resetUserPassword(u.id); setBanner(`Temp password for ${u.email}: ${r.tempPassword}`); } catch (e) { setError(e.message); }
  }
  async function removeUser(u) {
    if (!confirm(`Delete ${u.email} and all their data? This cannot be undone.`)) return;
    try { await api.deleteUser(u.id); loadAll(); } catch (e) { setError(e.message); }
  }
  async function createAdmin() {
    if (!aEmail.trim() || aPass.length < 8) { setError("Email/username + 8-char password required"); return; }
    setCreating(true); setError("");
    try {
      const r = await api.createAdmin(aEmail.trim(), aPass);
      setBanner(r.promoted ? `Promoted ${aEmail} to admin` : `Created admin ${aEmail}`);
      setAEmail(""); setAPass(""); loadAll();
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  }
  async function demote(a) {
    if (!confirm(`Remove admin rights from ${a.email}?`)) return;
    try { await api.removeAdmin(a.id); loadAll(); } catch (e) { setError(e.message); }
  }

  const r = analytics?.retrieval;

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>Admin Dashboard</h1>
        <div className="admin-head-btns">
          <button className="btn-line" onClick={() => navigate("/")}>Back to chat</button>
          <button className="btn-line" onClick={onLogout}>Log out</button>
        </div>
      </div>

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button key={t} className={`admin-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}
      {banner && <div className="toast" style={{ marginBottom: 16 }}>{banner}</div>}

      {/* ===== OVERVIEW ===== */}
      {tab === "Overview" && (
        <>
          {stats && (
            <div className="stat-grid">
              <Stat label="Total Users" value={stats.users} />
              <Stat label="Active (30d)" value={stats.active} />
              <Stat label="New Today" value={stats.newToday} />
              <Stat label="Conversations" value={stats.conversations} />
              <Stat label="Messages" value={stats.messages} />
              <Stat label="Documents" value={stats.documents} />
              <Stat label="Chunks" value={stats.chunks} />
              <Stat label="Brains" value={stats.brains} />
              <Stat label="Admins" value={stats.admins} />
            </div>
          )}
          {analytics && (
            <div className="chart-row">
              <div className="panel">
                <div className="panel-title">Daily Signups (7d)</div>
                <BarChart data={analytics.dailySignups} color="var(--accent)" />
              </div>
              <div className="panel">
                <div className="panel-title">Daily Messages (7d)</div>
                <BarChart data={analytics.dailyMessages} color="#8b7cf6" />
              </div>
            </div>
          )}
          {r && (
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-title">Retrieval Analytics <span className="muted-inline">({r.turns} turns · 30d)</span></div>
              <div className="mini-stat-grid">
                <Stat label="Clarifications" value={`${r.clarifications} (${r.turns ? Math.round((r.clarifications / r.turns) * 100) : 0}%)`} />
                <Stat label="Failed / Zero-result" value={`${r.zeroResult} (${r.turns ? Math.round((r.zeroResult / r.turns) * 100) : 0}%)`} />
                <Stat label="Semantic hits" value={r.semanticHits} />
                <Stat label="Keyword fallback" value={r.keywordFallback} />
                <Stat label="Helpful %" value={r.helpfulPct == null ? "—" : `${r.helpfulPct}%`} />
                <Stat label="👍 / 👎" value={`${r.up} / ${r.down}`} />
                <Stat label="Avg latency" value={`${r.avgLatency} ms`} />
                <Stat label="Errors" value={r.errors} />
              </div>
              <div className="chart-row" style={{ marginTop: 16 }}>
                <div className="panel sub"><div className="panel-title">Clarification trend</div><BarChart data={analytics.clarificationTrend} color="var(--amber)" /></div>
                <div className="panel sub"><div className="panel-title">Avg latency (ms)</div><BarChart data={analytics.latencyTrend} color="#5aa9e6" suffix=" ms" /></div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== KNOWLEDGE ===== */}
      {tab === "Knowledge" && (
        <div className="panel">
          <div className="panel-title">Knowledge base <span className="muted-inline">— shared brains, available to every user's chat</span></div>
          <AdminKnowledge />
        </div>
      )}

      {/* ===== USERS ===== */}
      {tab === "Users" && (
        <div className="panel">
          <div className="panel-title">Users</div>
          <div className="user-toolbar">
            <form onSubmit={doSearch} style={{ display: "flex", gap: 8, flex: 1 }}>
              <input className="field" placeholder="Search by email or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn-line" type="submit">Search</button>
            </form>
            <button className="btn-line" onClick={exportCsv}>Export CSV</button>
          </div>
          <div className="user-table">
            <div className="ut-head">
              <span>User</span><span>Status</span><span>Joined</span><span>Last login</span><span className="ut-actions">Actions</span>
            </div>
            {users.map((u) => (
              <div className="ut-row" key={u.id}>
                <span>
                  <div className="ut-email">{u.email} {u.is_admin ? <span className="tag-admin">admin</span> : null}</div>
                  <div className="ut-name">{u.name || "—"}</div>
                </span>
                <span><span className={`status-badge ${u.status || "active"}`}>{u.status || "active"}</span></span>
                <span className="muted-inline">{u.created_at ? u.created_at.slice(0, 10) : "—"}</span>
                <span className="muted-inline">{u.last_login ? u.last_login.slice(0, 10) : "Never"}</span>
                <span className="ut-actions">
                  <button className="link-a" onClick={() => resetPw(u)}>Reset pw</button>
                  {(u.status || "active") === "active" ? (
                    <>
                      <button className="link-a warn" onClick={() => changeStatus(u, "suspended")}>Suspend</button>
                      <button className="link-a warn" onClick={() => changeStatus(u, "disabled")}>Disable</button>
                      <button className="link-a danger" onClick={() => changeStatus(u, "terminated")}>Terminate</button>
                    </>
                  ) : (
                    <button className="link-a good" onClick={() => changeStatus(u, "active")}>Activate</button>
                  )}
                  <button className="link-a danger" onClick={() => removeUser(u)}>Delete</button>
                </span>
              </div>
            ))}
            {users.length === 0 && <div className="muted-inline" style={{ padding: 16 }}>No users found.</div>}
          </div>
        </div>
      )}

      {/* ===== ADMINS ===== */}
      {tab === "Admins" && (
        <div className="panel">
          <div className="panel-title">Admins ({admins.length})</div>
          {admins.map((a) => (
            <div className="admin-row" key={a.id}>
              <div>
                <strong>{a.name || a.email}</strong>
                {a.bootstrap && <span className="tag-bootstrap">env</span>}
                <div className="muted-inline">{a.email}</div>
              </div>
              {!a.bootstrap && <button className="link-danger" onClick={() => demote(a)}>Remove admin</button>}
            </div>
          ))}
          <div className="admin-create">
            <input className="field" placeholder="Email or username" value={aEmail} onChange={(e) => setAEmail(e.target.value)} />
            <input className="field" type="password" placeholder="Password (min 8)" value={aPass} onChange={(e) => setAPass(e.target.value)} />
            <button className="btn-primary" disabled={creating} onClick={createAdmin}>Create</button>
          </div>
        </div>
      )}
    </div>
  );
}
