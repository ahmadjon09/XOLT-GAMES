
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Fetch, getToken, setToken, clearToken } from '../api/fetcher.js';

const AuthData = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); 
  const [loading, setLoading] = useState(true);

  
  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await Fetch.get('/auth/me');
      setUser(profile);
    } catch (e) {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
    
    const onUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('xolt:unauthorized', onUnauthorized);
    return () => window.removeEventListener('xolt:unauthorized', onUnauthorized);
  }, [loadMe]);

  const login = useCallback(async (phone, password) => {
    const data = await Fetch.post('/auth/login', { phone, password });
    setToken(data.token);
    setUser(data.profile);
    return data.profile;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  
  const refresh = useCallback(async () => {
    try {
      const profile = await Fetch.get('/auth/me');
      setUser(profile);
      return profile;
    } catch (e) {
      return null;
    }
  }, []);

  
  const patchUser = useCallback((patch) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  return (
    <AuthData.Provider value={{ user, setUser: patchUser, loading, login, logout, refresh, loadMe }}>
      {children}
    </AuthData.Provider>
  );
}

export const useAuth = () => useContext(AuthData);
