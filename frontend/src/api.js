const BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  register: (name, email, password) =>
    fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    }).then(handle),

  login: (email, password) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(handle),

  getModels: () =>
    fetch(`${BASE}/models`, { headers: authHeaders() }).then(handle),

  getConversations: () =>
    fetch(`${BASE}/chat/conversations`, { headers: authHeaders() }).then(handle),

  createConversation: (title) =>
    fetch(`${BASE}/chat/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title }),
    }).then(handle),

  getMessages: (conversationId) =>
    fetch(`${BASE}/chat/conversations/${conversationId}/messages`, {
      headers: authHeaders(),
    }).then(handle),

  sendMessage: (conversationId, content, modelId) =>
    fetch(`${BASE}/chat/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, modelId }),
    }).then(handle),
};
