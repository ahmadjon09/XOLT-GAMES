// ============================================================================
// SOCKET SIG'IM QO'RIQCHISI
//
// Har bir socket paketi handler'ga yetib borishidan OLDIN tekshiriladi:
//   * "og'ir" event (yangi o'yin/xona ochish) — server band bo'lsa rad etiladi
//   * "o'rtacha" event (mavjud o'yinga qo'shilish) — faqat BUSY holatda rad etiladi
//   * qolgan hamma narsa (yurish, javob, chiqish, disconnect) — HAR DOIM o'tadi,
//     ya'ni allaqachon boshlangan o'yinlar buzilmaydi.
//
// Rad etilganda client ikki yo'l bilan xabar oladi:
//   1) ack callback bo'lsa — { ok:false, error:'SERVER_BUSY' }
//   2) 'error' + 'server:busy' event'lari (eski o'yinlar shu yo'lni ishlatadi)
// Natija: client HECH QACHON javobsiz qolib "TIMEOUT" ko'rsatmaydi.
// ============================================================================
import { checkCapacity, getCapacity, LEVEL } from '../utils/capacity.js';

/** Yangi xona/o'yin YARATADIGAN event'lar (eng qimmat). */
export const HEAVY_EVENTS = new Set([
  'mathgame:create', 'mathgame:rematch',
  'ttt:create', 'ttt:rematch',
  'chess:create', 'chess:rematch',
  'checkers:create', 'checkers:rematch',
  'typing:host',
  'code:host',
  'quiz:host',
]);

/** Mavjud o'yinga QO'SHILADIGAN event'lar (o'rtacha). */
export const JOIN_EVENTS = new Set([
  'mathgame:join', 'ttt:join', 'chess:join', 'checkers:join',
  'typing:join', 'code:join', 'quiz:join',
]);

function kindOf(event) {
  if (HEAVY_EVENTS.has(event)) return 'heavy';
  if (JOIN_EVENTS.has(event)) return 'light';
  return null;
}

/**
 * Socket'ga qo'riqchini o'rnatish.
 * @param {import('socket.io').Socket} socket
 */
export function attachCapacityGuard(socket) {
  socket.use((packet, next) => {
    try {
      const [event, ...args] = packet;
      const kind = kindOf(event);
      if (!kind) return next();

      const verdict = checkCapacity(kind);
      if (verdict.ok) return next();

      const payload = {
        ok: false,
        error: 'SERVER_BUSY',
        code: 'SERVER_BUSY',
        reason: verdict.reason,
        message: verdict.message,
        retryAfterMs: verdict.retryAfterMs,
        event,
      };

      // 1) ack callback (oxirgi argument funksiya bo'lsa)
      const ack = args[args.length - 1];
      if (typeof ack === 'function') {
        try { ack(payload); } catch { /* client ketgan */ }
      }
      // 2) umumiy xabar (ack ishlatmaydigan clients uchun)
      try {
        socket.emit('server:busy', payload);
        socket.emit('error', { code: 'SERVER_BUSY', message: verdict.message, retryAfterMs: verdict.retryAfterMs });
      } catch { /* noop */ }

      // next() CHAQIRILMAYDI — handler ishlamaydi, yangi xotira ajratilmaydi
      return undefined;
    } catch {
      // Qo'riqchining o'zi xato bersa — paket o'tsin (himoya foydalanuvchini bloklab qo'ymasin)
      return next();
    }
  });

  // Ulanish paytida holat "band" bo'lsa — client darhol bilsin (UI'ni bloklaydi)
  const cap = getCapacity();
  if (cap.level !== LEVEL.OK) {
    try {
      socket.emit('server:status', { level: cap.level, reason: cap.reason });
    } catch { /* noop */ }
  }
}

/** Barcha client'larga holat o'zgarganini bildirish (io darajasida). */
export function broadcastCapacityStatus(io, level, reason) {
  try {
    io.emit('server:status', { level, reason });
  } catch { /* noop */ }
}
