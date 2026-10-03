
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Fetch, clearToken } from '../api/fetcher.js';

const AuthData = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); 
  const [loading, setLoading] = useState(true);

  
  const loadMe = useCallback(async () => {
    // OAuth's JWT fragment is captured before React mounts (see main.jsx), so this
    // initial profile request can authenticate with the new Bearer token.
    try {
      const profile = await Fetch.get('/auth/me');
      setUser(profile);
    } catch (e) {
      // Faqat 401 (token noto'g'ri/muddati tugagan) da chiqarish;
      // 404/500/tarmoq xatosi foydalanuvchini chiqarmaslik kerak
      if (e?.status === 401 || e?.code === 'UNAUTHORIZED') {
        clearToken();
        setUser(null);
      }
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


  const logout = useCallback(async () => {
    clearToken();
    setUser(null);
    try { await Fetch.post('/auth/logout', {}); } catch { /* local sign-out is still complete */ }
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
    <AuthData.Provider value={{ user, setUser: patchUser, loading, logout, refresh, loadMe }}>
      {children}
    </AuthData.Provider>
  );
}

export const useAuth = () => useContext(AuthData);
