/**
 * SERVER HOLATI (sig'im) KONTEKSTI
 *
 * Vazifasi: server RAM/CPU jihatdan "band" bo'lganini frontend BILISHI va
 * yangi o'yin ochishga urinmasligi. Aks holda foydalanuvchi tugmani bosadi,
 * javob kelmaydi va "TIMEOUT" ko'radi — bu chalkash va xunuk.
 *
 * Ikki manba:
 *   1) GET /api/health  — sahifa ochilganda + har 20 s (faqat sahifa ko'rinib
 *      turganda; fon tabda so'rov yuborilmaydi — batareya/trafik tejaladi).
 *   2) Socket event'lari: 'server:status' va 'server:busy' — holat o'zgarishi
 *      DARHOL bilinadi (polling'ni kutmaydi).
 *
 * level:
 *   'ok'   — hammasi normal
 *   'warn' — yuk yuqori: og'ir o'yin (3D poyga) vaqtincha yopiq
 *   'busy' — server band: yangi o'yin umuman ochilmaydi
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { http } from '../api/http.js';
import { useSocket } from './SocketContext.jsx';
import { useToast } from './ToastContext.jsx';

const ServerStatusData = createContext({
  level: 'ok',
  busy: false,
  heavyBlocked: false,
  reason: null,
  memoryPct: 0,
  refresh: () => {},
});

const POLL_MS = 20000;

export function ServerStatusProvider({ children }) {
  const { socket } = useSocket();
  const toast = useToast();
  const [status, setStatus] = useState({ level: 'ok', reason: null, memoryPct: 0 });
  const timerRef = useRef(null);

  const apply = useCallback((data) => {
    if (!data) return;
    const level = data.level === 'busy' || data.level === 'warn' ? data.level : 'ok';
    setStatus({
      level,
      reason: data.reason ?? null,
      memoryPct: Number(data.memoryPct) || 0,
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await http.get('/health');
      apply(res.data);
    } catch (err) {
      // 503 = server band (bu ham foydali ma'lumot, xato emas)
      if (err?.status === 503 || err?.code === 'SERVER_BUSY') {
        setStatus({ level: 'busy', reason: 'MEMORY', memoryPct: 100 });
      }
      // Tarmoq xatosi holatni o'zgartirmaydi — SocketContext buni alohida ko'rsatadi
    }
  }, [apply]);

  // --- Davriy tekshiruv (faqat sahifa ko'rinib turganda) ---
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    tick();
    timerRef.current = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  // --- Socket orqali darhol xabar ---
  useEffect(() => {
    if (!socket) return undefined;
    const onStatus = (p) => apply(p);
    const onBusy = (p) => {
      setStatus({ level: 'busy', reason: p?.reason ?? 'MEMORY', memoryPct: 100 });
      // Barcha o'yinlar uchun umumiy xabar (aks holda tugma "osilib" qolgandek ko'rinardi)
      toast?.error?.(p?.message || 'Server hozir band — biroz kutib, qayta urinib ko‘ring');
      // Bir necha soniyadan keyin haqiqiy holatni qayta so'raymiz
      setTimeout(refresh, 5000);
    };
    socket.on('server:status', onStatus);
    socket.on('server:busy', onBusy);
    return () => {
      socket.off('server:status', onStatus);
      socket.off('server:busy', onBusy);
    };
  }, [socket, apply, refresh, toast]);

  const value = useMemo(() => ({
    level: status.level,
    busy: status.level === 'busy',
    // Og'ir o'yinlar (3D poyga) 'warn' darajasida ham bloklanadi
    heavyBlocked: status.level !== 'ok',
    reason: status.reason,
    memoryPct: status.memoryPct,
    refresh,
  }), [status, refresh]);

  return <ServerStatusData.Provider value={value}>{children}</ServerStatusData.Provider>;
}

export const useServerStatus = () => useContext(ServerStatusData);
