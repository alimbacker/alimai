import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Chat from "./pages/Chat.jsx";

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

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" /> : <Login onAuth={handleAuth} />}
      />
      <Route
        path="/register"
        element={token ? <Navigate to="/" /> : <Register onAuth={handleAuth} />}
      />
      <Route
        path="/"
        element={
          token ? <Chat onLogout={handleLogout} /> : <Navigate to="/login" />
        }
      />
    </Routes>
  );
}
