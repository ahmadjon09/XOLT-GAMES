// Socket.IO sozlash - auth, rate limit, sig'im qo'riqchisi va barcha o'yinlar
//
// MUHIM PRINSIP: bitta o'yin moduli ishdan chiqsa ham server AYLANISHDA DAVOM
// ETADI. Har bir modul alohida try/catch bilan ulanadi, xato bo'lsa — faqat
// o'sha o'yin "vaqtincha ishlamaydi" deb javob beradi (butun server crash emas).
import { Server } from 'socket.io';
import { socketAuthenticate, checkConnectionLimit, registerEventRateLimit, userGameMap } from './shared.js';
import { attachCapacityGuard, broadcastCapacityStatus } from './capacityGuard.js';
import {
  startCapacityMonitor,
  setSocketCounter,
  registerLoadSource,
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
import { prisma } from '../prisma/client.js';
import { getGameCatalog } from '../services/gameCatalog.js';
import { getPendingGameInvites, refreshSocket, trackSocket, untrackSocket } from '../mongo/runtimeStore.js';
import { setSocketServer } from './runtime.js';

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

// All entry points that create or join a room respect the admin game catalog.
const GAME_ACCESS_EVENTS = {
  'mathgame:create': 'math', 'mathgame:rematch': 'math', 'mathgame:join': 'math',
  'quiz:host': 'quiz', 'quiz:join': 'quiz',
  'ttt:create': 'tictactoe', 'ttt:rematch': 'tictactoe', 'ttt:join': 'tictactoe',
  'chess:create': 'chess', 'chess:rematch': 'chess', 'chess:join': 'chess',
  'checkers:create': 'checkers', 'checkers:rematch': 'checkers', 'checkers:join': 'checkers',
  'typing:host': 'typerace', 'typing:join': 'typerace',
  'code:host': 'codebattle', 'code:join': 'codebattle',
};

async function emitFriendPresence(io, userId, online) {
  try {
    const requests = await prisma.friendRequest.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { recipientId: userId }] },
      select: { requesterId: true, recipientId: true },
    });
    const friendIds = new Set();
    for (const request of requests) {
      friendIds.add(request.requesterId === userId ? request.recipientId : request.requesterId);
    }
    for (const friendId of friendIds) {
      io.to(`user:${friendId}`).emit('friend:presence', { userId, online });
    }
  } catch (error) {
    console.warn('[friends] presence broadcast failed:', error?.message || error);
  }
}

async function deliverPendingInvites(socket, userId) {
  try {
    const invites = await getPendingGameInvites(userId);
    if (!invites.length) return;
    const senders = await prisma.user.findMany({
      where: { id: { in: [...new Set(invites.map((invite) => invite.fromUserId))] } },
      select: { id: true, full_name: true, avatar: true, username: true },
    });
    const byId = new Map(senders.map((sender) => [sender.id, sender]));
    for (const invite of invites) {
      socket.emit('friend:game_invite', { ...invite, from: byId.get(invite.fromUserId) || null });
    }
  } catch (error) {
    console.warn('[friends] pending invites delivery failed:', error?.message || error);
  }
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
  setSocketServer(io);

  // --- Resurs monitori (RAM / event loop) ---
  startCapacityMonitor();
  setSocketCounter(() => io.engine?.clientsCount ?? io.sockets?.sockets?.size ?? 0);
  registerLoadSource('active-game-rooms', () => new Set([...userGameMap.values()].map(({ type, id }) => `${type}:${id}`)).size);

  // Auth + ulanish cheklovi
  io.use(socketAuthenticate);
  io.use(checkConnectionLimit);

  io.on('connection', (socket) => {
    // Admin catalog'da o'chirgan o'yinlar uchun yangi xona/xost yaratishni serverda ham bloklaymiz.
    socket.use((packet, next) => {
      const gameType = GAME_ACCESS_EVENTS[packet[0]];
      if (!gameType) return next();
      getGameCatalog().then((catalog) => {
        const active = catalog.find((game) => game.id === gameType)?.active ?? false;
        if (active) return next();
        const payload = { code: 'GAME_DISABLED', gameType, message: 'Bu o\'yin hozircha admin tomonidan o\'chirib qo\'yilgan' };
        socket.emit('error', payload);
        const ack = packet.slice(1).find((value) => typeof value === 'function');
        if (ack) ack({ ok: false, error: 'GAME_DISABLED', message: payload.message });
      }).catch(() => next());
    });

    const socketUser = socket.data.user;
    if (socketUser?.kind === 'user') {
      const userId = socketUser.id;
      socket.join(`user:${userId}`);
      const heartbeat = setInterval(() => refreshSocket(userId, socket.id), 25_000);
      if (typeof heartbeat.unref === 'function') heartbeat.unref();
      trackSocket(userId, socket.id)
        .then((becameOnline) => becameOnline && emitFriendPresence(io, userId, true))
        .catch((error) => console.warn('[friends] presence connect failed:', error?.message || error));
      deliverPendingInvites(socket, userId);
      socket.on('disconnect', async () => {
        clearInterval(heartbeat);
        const becameOffline = await untrackSocket(userId, socket.id);
        if (becameOffline) await emitFriendPresence(io, userId, false);
      });
    }

    // Server band bo'lsa — yangi o'yin ochilmaydi (crash oldini olish).
    // Bu birinchi bo'lib o'rnatiladi: og'ir handler'lar umuman ishlamaydi.
    attachCapacityGuard(socket);

    registerEventRateLimit(socket);

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
