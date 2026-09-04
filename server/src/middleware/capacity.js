// ============================================================================
// HTTP SIG'IM QO'RIQCHISI (Express middleware)
//
// Server RAM/event-loop chegarasiga yetganda og'ir so'rovlar (yangi o'yin
// ochish, statistika, yuklash) 503 + SERVER_BUSY bilan rad etiladi.
// Muhim: auth, health va oddiy GET so'rovlar BLOKLANMAYDI — foydalanuvchi
// tizimdan chiqib ketmaydi, faqat yangi og'ir ish qabul qilinmaydi.
// ============================================================================
import { getCapacity, LEVEL, BUSY_MESSAGE } from '../utils/capacity.js';

/** Har doim o'tkaziladigan yo'llar (hayotiy muhim). */
const ALWAYS_ALLOW = [
  '/health',
  '/auth/login',
  '/auth/me',
  '/auth/refresh',
];

const isAllowed = (path) => ALWAYS_ALLOW.some((p) => path.startsWith(p));

/**
 * @param {object} opts
 * @param {boolean} opts.heavy true bo'lsa — "warn" darajasida ham rad etiladi
 */
export function capacityGuard(opts = {}) {
  const heavy = !!opts.heavy;
  return (req, res, next) => {
    try {
      if (isAllowed(req.path)) return next();
      const cap = getCapacity();
      const blocked = cap.level === LEVEL.BUSY || (heavy && cap.level === LEVEL.WARN);
      if (!blocked) return next();

      res.setHeader('Retry-After', '15');
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVER_BUSY',
          message: BUSY_MESSAGE,
          reason: cap.reason,
          retryAfterMs: 15000,
        },
      });
    } catch {
      return next();
    }
  };
}

/** /api/health uchun qisqa holat obyekti (public — maxfiy ma'lumot yo'q). */
export function capacitySummary() {
  const cap = getCapacity();
  return {
    level: cap.level,                 // ok | warn | busy
    busy: cap.level === LEVEL.BUSY,
    heavyGamesDisabled: cap.level !== LEVEL.OK, // 3D poyga kabi og'ir o'yinlar
    reason: cap.reason,
    memoryPct: cap.memory.usedPct,
    freeMb: cap.freeMb,
    activeGames: cap.games,
    sockets: cap.sockets,
    loopLagMs: cap.loopLagMs,
  };
}
