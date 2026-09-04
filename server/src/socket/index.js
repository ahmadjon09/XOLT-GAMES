// Socket.IO sozlash - auth, rate limit, sig'im qo'riqchisi va barcha o'yinlar
//
// MUHIM PRINSIP: bitta o'yin moduli ishdan chiqsa ham server AYLANISHDA DAVOM
// ETADI. Har bir modul alohida try/catch bilan ulanadi, xato bo'lsa — faqat
// o'sha o'yin "vaqtincha ishlamaydi" deb javob beradi (butun server crash emas).
import { Server } from 'socket.io';
import { socketAuthenticate, checkConnectionLimit, registerEventRateLimit } from './shared.js';
import { attachCapacityGuard, broadcastCapacityStatus } from './capacityGuard.js';
import {
  startCapacityMonitor,
  setSocketCounter,
  getCapacity,
  LEVEL,
} from '../utils/capacity.js';
import { setupMathGame } from './mathGame.js';
import { setupQuizGame } from './quizGame.js';
import { setupTicTacToe } from './tictactoe.js';
import { setupTypingRace } from './typingRace.js';
import { setupCodeBattle } from './codeBattle.js';
import { setupChessGame } from './chessGame.js';
import { setupCheckersGame } from './checkersGame.js';
import { setupRaceGame } from './raceGame.js';

// 3D poyga real-time event'i (umumiy rate limiterdan chiqariladi).
// race3d moduli yuklanmasa ham bu ro'yxat kerak — shuning uchun shu yerda.
const RACE3D_BIN_EVENT = 'r3b';
const RACE3D_ACK_EVENTS = ['r3:c', 'r3:j', 'r3:s'];

/** Modulni xavfsiz ulash: xato bo'lsa log qilinadi, server yiqilmaydi. */
function safeSetup(name, fn, io) {
  try {
    fn(io);
    return true;
  } catch (err) {
    console.error(`[socket] "${name}" o'yin moduli ulanmadi (server ishlashda davom etadi):`, err?.message || err);
    return false;
  }
}

/**
 * 3D poygani ULANMAGAN holatda ham client javobsiz qolmasin:
 * har bir so'rovga darhol tushunarli xato qaytariladi (TIMEOUT o'rniga).
 */
function registerRace3DFallback(io, reason) {
  io.on('connection', (socket) => {
    for (const evt of RACE3D_ACK_EVENTS) {
      socket.on(evt, (_payload, ack) => {
        const res = {
          ok: false,
          error: 'RACE_UNAVAILABLE',
          message: "3D poyga vaqtincha ishlamayapti — keyinroq urinib ko'ring",
          reason,
        };
        if (typeof ack === 'function') {
          try { ack(res); } catch { /* noop */ }
        } else {
          socket.emit('r3:error', { code: 'RACE_UNAVAILABLE' });
        }
      });
    }
  });
}

export async function setupSocket(httpServer, corsOrigins) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Doimiy ulanishlarda toza xabar berish
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  // --- Resurs monitori (RAM / event loop) ---
  startCapacityMonitor();
  setSocketCounter(() => io.engine?.clientsCount ?? io.sockets?.sockets?.size ?? 0);

  // Auth + ulanish cheklovi
  io.use(socketAuthenticate);
  io.use(checkConnectionLimit);

  io.on('connection', (socket) => {
    // Server band bo'lsa — yangi o'yin ochilmaydi (crash oldini olish).
    // Bu birinchi bo'lib o'rnatiladi: og'ir handler'lar umuman ishlamaydi.
    attachCapacityGuard(socket);

    // Real-time poyga event'lari (r3b) umumiy limiterga kirmaydi: xona ichida
    // aniqroq himoya (input rate + strike/kick) bor.
    registerEventRateLimit(socket, { exemptEvents: new Set([RACE3D_BIN_EVENT]) });

    // PING - frontend ulanganligini tekshiradi
    socket.on('ping', (cb) => {
      if (typeof cb === 'function') cb({ ok: true, t: Date.now() });
    });

    // Client server holatini so'rashi mumkin (UI "server band" bannerini ko'rsatadi)
    socket.on('server:status', (cb) => {
      const cap = getCapacity();
      const payload = { level: cap.level, reason: cap.reason, memoryPct: cap.memory.usedPct };
      if (typeof cb === 'function') cb(payload);
      else socket.emit('server:status', payload);
    });
  });

  // O'yinlarni ulash (har biri alohida himoyalangan)
  safeSetup('math', setupMathGame, io);
  safeSetup('quiz', setupQuizGame, io);
  safeSetup('tictactoe', setupTicTacToe, io);
  safeSetup('typing', setupTypingRace, io);
  safeSetup('codebattle', setupCodeBattle, io);
  safeSetup('chess', setupChessGame, io);
  safeSetup('checkers', setupCheckersGame, io);
  safeSetup('race', setupRaceGame, io);

  // 3D poyga (server-avtoritar, binary protokol) — DINAMIK yuklanadi.
  // Sababi: bu modul packages/*.ts fayllarini import qiladi. Eski Node
  // versiyasida (yoki fayllar yetishmasa) statik import BUTUN serverni
  // ishga tushirmay qo'yardi. Endi eng yomon holatda faqat 3D poyga o'chadi.
  try {
    const mod = await import('./race3d.js');
    // setupRace3D o'zi sig'im monitoriga ulanadi (load source + shedder)
    mod.setupRace3D(io);
    console.log('[socket] race3d moduli ulandi');
  } catch (err) {
    console.error('[socket] race3d moduli yuklanmadi — 3D poyga o\'chirildi:', err?.message || err);
    registerRace3DFallback(io, 'MODULE_LOAD_FAILED');
  }

  // Holat o'zgarsa — barcha client'larga bildiramiz (UI darhol yangilanadi)
  let lastLevel = LEVEL.OK;
  const statusTimer = setInterval(() => {
    const cap = getCapacity();
    if (cap.level !== lastLevel) {
      lastLevel = cap.level;
      broadcastCapacityStatus(io, cap.level, cap.reason);
      console.warn(`[socket] server holati: ${cap.level} (${cap.reason || '—'})`);
    }
  }, 3000);
  if (typeof statusTimer.unref === 'function') statusTimer.unref();

  return io;
}
