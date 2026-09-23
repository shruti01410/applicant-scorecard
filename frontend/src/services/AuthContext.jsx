import React, { createContext, useState, useEffect, useContext } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

function tokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch (e) {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (stored && token && !tokenExpired(token)) {
      try { setUser(JSON.parse(stored)); }
      catch (e) { localStorage.removeItem('user'); }
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    setLoading(false);
  }, []);

  async function login(username, password) {
    const data = await api.post('/api/auth/login', JSON.stringify({ username: String(username||'').trim(), password: String(password||'').trim() }));
    if (data.mfa_required) {
      // Password OK but MFA pending — LoginPage shows the code step.
      return { mfa_required: true, mfa_token: data.mfa_token };
    }
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function loginWithMfa(mfaToken, code) {
    const data = await api.post('/api/auth/mfa/login', JSON.stringify({ mfa_token: mfaToken, code: String(code||'').trim() }));
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function loginWithGoogle(idToken) {
    const data = await api.post('/api/auth/google', JSON.stringify({ idToken }));
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, loginWithMfa, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}