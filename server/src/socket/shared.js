// Socket.IO umumiy yordamchilar - auth, rate limit, o'yin registrlari
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../prisma/client.js';

const JWT_SECRET = env.jwtSecret;

// Foydalanuvchi -> socketId (reconnect uchun)
export const userSocketMap = new Map();

// Foydalanuvchi -> aktiv o'yin { type, id } (bir vaqtda bitta o'yin)
export const userGameMap = new Map();

// IP bo'yicha ulanish cheklovi (DDoS himoyasi)
const connectCount = new Map();
const CONNECT_LIMIT = 15; // 1 daqiqada har IP dan 15 ulanish

// Socket event tezligi cheklovi
const eventCounts = new Map();
const EVENT_LIMIT = 300; // 10 sekundda har socket uchun

// ============ SOCKET AUTH ============

export function socketAuthenticate(socket, next) {
  try {
    let token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      const header = socket.handshake.headers && socket.handshake.headers.authorization;
      if (header && header.startsWith('Bearer ')) {
        token = header.slice('Bearer '.length);
      }
    }
    if (!token) return next(new Error('AUTH_TOKEN_MISSING'));

    const decoded = jwt.verify(token, JWT_SECRET);

    socket.data.user = {
      id: decoded.id,
      kind: decoded.kind,
      role: decoded.kind === 'staff' ? decoded.role : 'STUDENT',
      full_name: decoded.full_name,
    };
    next();
  } catch (err) {
    next(new Error('AUTH_INVALID_TOKEN'));
  }
}

// ============ RATE LIMIT ============

export function checkConnectionLimit(socket, next) {
  const ip = socket.handshake.address || 'unknown';
  const now = Date.now();
  const arr = (connectCount.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= CONNECT_LIMIT) {
    connectCount.set(ip, arr);
    return next(new Error('CONNECTION_RATE_LIMITED'));
  }
  arr.push(now);
  connectCount.set(ip, arr);
  next();
}

// Har bir socket uchun event hisoblagich - limit oshsa uziladi
export function registerEventRateLimit(socket) {
  let count = 0;
  const resetTimer = setInterval(() => {
    count = 0;
  }, 10_000);

  socket.onAny(() => {
    count += 1;
    if (count > EVENT_LIMIT) {
      socket.emit('error', { code: 'EVENT_RATE_LIMITED', message: 'Juda ko\'p so\'rov yuborildi' });
      socket.disconnect(true);
    }
  });

  socket.on('disconnect', () => clearInterval(resetTimer));
}

// ============ UMUMIY HELPERS ============

export function emitError(socket, code, message) {
  socket.emit('error', { code, message });
}

// DB dan to'liq o'quvchini olish (frame/effect bilan)
export async function fetchFullUser(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { currentFrame: true, currentEffect: true },
  });
}

// O'yinchi obyektini qurish
export function buildPlayerData(user, socketId) {
  return {
    id: user.id,
    full_name: user.full_name,
    avatar: user.avatar,
    currentFrame: user.currentFrame || null,
    currentEffect: user.currentEffect || null,
    coin: user.coin,
    score: user.score,
    week_score: user.week_score,
    month_score: user.month_score,
    socketId,
    connected: true,
  };
}

// Raqibga ko'rinadigan ma'lumotlar (coin, score ichida qoladi - maxfiy emas)
export function sanitizePlayer(player) {
  if (!player) return null;
  return {
    id: player.id,
    full_name: player.full_name,
    avatar: player.avatar,
    currentFrame: player.currentFrame,
    currentEffect: player.currentEffect,
    coin: player.coin,
    score: player.score,
    week_score: player.week_score,
    month_score: player.month_score,
    connected: player.connected,
  };
}

// Foydalanuvchini o'yinga bog'lash
export function registerGame(userId, type, gameId) {
  userGameMap.set(userId, { type, id: gameId });
}

// O'yindan chiqarish (faqat shu o'yin bo'lsa)
export function unregisterGame(userId, type, gameId) {
  const entry = userGameMap.get(userId);
  if (entry && entry.type === type && entry.id === gameId) {
    userGameMap.delete(userId);
  }
}

// O'yin tugaganidan keyin ham reglarini tozalash
export function clearUserGameMap(userId) {
  userGameMap.delete(userId);
}

// Statistikaga yozish (admin panel uchun)
export async function recordGame(data) {
  try {
    await prisma.gameRecord.create({ data });
  } catch (err) {
    console.error('[recordGame] error:', err);
  }
}
