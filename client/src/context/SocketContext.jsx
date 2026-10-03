
import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { api } from '../api/api.js';
import { getToken } from '../api/fetcher.js';

const SocketData = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      setSocket(null);
      setConnected(false);
      return;
    }


    const s = io(api, {
      withCredentials: true,
      // Cookie bo'lmasa ham ulanish uchun token handshake'da yuboriladi.
      auth: (cb) => cb({ token: getToken() || undefined }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 15000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));


    s.on('error', (err) => {
      window.dispatchEvent(new CustomEvent('xolt:socket_error', { detail: err }));
    });

    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [user]);

  return <SocketData.Provider value={{ socket, connected }}>{children}</SocketData.Provider>;
}

export const useSocket = () => useContext(SocketData);
