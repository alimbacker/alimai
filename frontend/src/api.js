const BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function jsonHeaders() {
  return { "Content-Type": "application/json", ...authHeaders() };
}
async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  // --- auth ---
  register: (name, email, password) =>
    fetch(`${BASE}/auth/register`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ name, email, password }) }).then(handle),
  login: (email, password) =>
    fetch(`${BASE}/auth/login`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ email, password }) }).then(handle),

  me: () => fetch(`${BASE}/auth/me`, { headers: authHeaders() }).then(handle),

  // --- models ---
  getModels: () => fetch(`${BASE}/models`, { headers: authHeaders() }).then(handle),

  // --- conversations ---
  getConversations: () =>
    fetch(`${BASE}/chat/conversations`, { headers: authHeaders() }).then(handle),
  createConversation: (title) =>
    fetch(`${BASE}/chat/conversations`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ title }) }).then(handle),
  getMessages: (id) =>
    fetch(`${BASE}/chat/conversations/${id}/messages`, { headers: authHeaders() }).then(handle),
  sendMessage: (id, content, modelId, { brainId, routingMode } = {}) =>
    fetch(`${BASE}/chat/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ content, modelId, brainId, routingMode }),
    }).then(handle),

  // --- brains (RAG knowledge bases) ---
  getBrains: () => fetch(`${BASE}/brains`, { headers: authHeaders() }).then(handle),
  createBrain: (name, emoji, description) =>
    fetch(`${BASE}/brains`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ name, emoji, description }) }).then(handle),
  deleteBrain: (id) =>
    fetch(`${BASE}/brains/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle),
  getDocuments: (brainId) =>
    fetch(`${BASE}/brains/${brainId}/documents`, { headers: authHeaders() }).then(handle),
  addDocument: (brainId, title, text, source = "paste") =>
    fetch(`${BASE}/brains/${brainId}/documents`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ title, text, source }) }).then(handle),
  deleteDocument: (brainId, docId) =>
    fetch(`${BASE}/brains/${brainId}/documents/${docId}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  // --- feedback ---
  sendFeedback: (conversationId, msgId, value, query) =>
    fetch(`${BASE}/chat/conversations/${conversationId}/messages/${msgId}/feedback`, {
      method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ value, query }) }).then(handle),

  // --- admin ---
  getAdminStats: () => fetch(`${BASE}/admin/stats`, { headers: authHeaders() }).then(handle),
  getAdminAnalytics: () => fetch(`${BASE}/admin/analytics`, { headers: authHeaders() }).then(handle),
  getAdminUsers: (search = "") =>
    fetch(`${BASE}/admin/users?search=${encodeURIComponent(search)}`, { headers: authHeaders() }).then(handle),
  setUserStatus: (id, status) =>
    fetch(`${BASE}/admin/users/${id}/status`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ status }) }).then(handle),
  resetUserPassword: (id) =>
    fetch(`${BASE}/admin/users/${id}/reset-password`, { method: "POST", headers: authHeaders() }).then(handle),
  deleteUser: (id) =>
    fetch(`${BASE}/admin/users/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle),
  getAdmins: () => fetch(`${BASE}/admin/admins`, { headers: authHeaders() }).then(handle),
  createAdmin: (email, password, name) =>
    fetch(`${BASE}/admin/admins`, { method: "POST", headers: jsonHeaders(),
      body: JSON.stringify({ email, password, name }) }).then(handle),
  removeAdmin: (id) =>
    fetch(`${BASE}/admin/admins/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle),
};