/**
 * AuthContext — holds the logged-in user and exposes login/logout.
 * Persists the session in localStorage so a refresh keeps the user.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, clearToken } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ps_user') || 'null');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  // If a request anywhere returns 401, force logout cleanly.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  async function login(username, password) {
    setLoading(true);
    try {
      const { token, user: u } = await api.login(username, password);
      setToken(token);
      localStorage.setItem('ps_user', JSON.stringify(u));
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
