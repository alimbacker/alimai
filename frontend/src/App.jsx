import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Chat from "./pages/Chat.jsx";
import Admin from "./pages/Admin.jsx";
import Profile from "./pages/Profile.jsx";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));

  function handleAuth(newToken) {
    localStorage.setItem("token", newToken);
    setToken(newToken);
  }
  function handleLogout() {
    localStorage.removeItem("token");
    setToken(null);
  }

  const guard = (el) => (token ? el : <Navigate to="/login" />);

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <Login onAuth={handleAuth} />} />
      <Route path="/register" element={token ? <Navigate to="/" /> : <Register onAuth={handleAuth} />} />
      <Route path="/admin" element={guard(<Admin onLogout={handleLogout} />)} />
      <Route path="/profile" element={guard(<Profile onLogout={handleLogout} />)} />
      <Route path="/" element={guard(<Chat onLogout={handleLogout} />)} />
    </Routes>
  );
}
