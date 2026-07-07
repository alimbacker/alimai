import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function Profile() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  useEffect(() => { api.me().then((d) => setUser(d.user)).catch(() => {}); }, []);

  const initials = (user?.name || user?.email || "A").slice(0, 1).toUpperCase();
  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="admin-head">
        <h1>My Profile</h1>
        <button className="btn-line" onClick={() => navigate("/")}>Back to chat</button>
      </div>
      <div className="panel">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{initials}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{user?.name || "—"}</div>
            <div className="muted-inline">{user?.email || ""}</div>
          </div>
        </div>
        <div className="profile-field"><span>Account status</span><strong>{user?.status || "active"}</strong></div>
        <div className="profile-field"><span>Role</span><strong>{user?.is_admin ? "Admin" : "Member"}</strong></div>
      </div>
    </div>
  );
}
