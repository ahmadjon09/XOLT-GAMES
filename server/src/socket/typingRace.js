// TYPE RACING - tez yozish poygasi (10 tagacha o'yinchi)
// O'yin yaratgan odamning tili bo'yicha matnlar tanlanadi (uz/ru/en)
// Admin-managed text prompts are selected by language for the typing race.
// Solo rejim coin/ball bermaydi, faqat WPM reytingga yoziladi (REST orqali)
import { prisma } from '../prisma/client.js';
import {
  emitError,
  fetchFullUser,
  registerGame,
  unregisterGame,
  userSocketMap,
  userGameMap,
  recordGame,
} from './shared.js';
import { randomCode } from '../utils/helpers.js';

const MAX_PLAYERS = 10;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const FINISHED_SESSION_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const PODIUM_COINS = [50, 30, 15];
const CORRECT_BONUS = 2; // har bir o'yinchiga ball

const sessions = new Map();

function buildPlayer(user, socketId) {
  return {
    userId: user.id,
    full_name: user.full_name,
    avatar: user.avatar,
    currentFrame: user.currentFrame || null,
    currentEffect: user.currentEffect || null,
    socketId,
    connected: true,
    progress: 0,     // 0-100
    wpm: 0,
    accuracy: 100,
    done: false,
    finishMs: 0,
    rank: null,
  };
}

function publicSession(session) {
  return {
    code: session.code,
    lang: session.lang,
    status: session.status,
    hostId: session.hostId,
    texts: session.status !== 'waiting' ? session.texts : null,
    currentTextIdx: session.currentTextIdx,
    startedAt: session.startedAt,
    players: [...session.players.values()].map((p) => ({
      userId: p.userId,
      full_name: p.full_name,
      avatar: p.avatar,
      currentFrame: p.currentFrame,
      currentEffect: p.currentEffect,
      connected: p.connected,
      progress: p.progress,
      wpm: p.wpm,
      accuracy: p.accuracy,
      done: p.done,
      rank: p.rank,
    })),
  };
}

async function pickTexts(lang) {
  // Load the current language's text library.
  const where = { lang };
  const texts = await prisma.typingText.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  if (texts.length === 0) {
    // Fallback: boshqa tildan
    const any = await prisma.typingText.findMany({ orderBy: { createdAt: 'asc' }, take: 30 });
    if (any.length === 0) return null;
    // 3 ta tasodifiy
    const shuffled = [...any].sort(() => Math.random() - 0.5).slice(0, 3);
    return shuffled.map((t) => ({ id: t.id, title: t.title, content: t.content }));
  }
  const shuffled = [...texts].sort(() => Math.random() - 0.5).slice(0, 3);
  return shuffled.map((t) => ({ id: t.id, title: t.title, content: t.content }));
}

async function finishRace(io, session) {
  if (session.status === 'finished') return;
  session.status = 'finished';
  session.finishedAt = Date.now();
  session.lastActivity = Date.now();

  // Ranking
  const players = [...session.players.values()].sort((a, b) => {
    if (a.done && b.done) return a.finishMs - b.finishMs;
    if (a.done !== b.done) return a.done ? -1 : 1;
    return b.progress - a.progress;
  });
  players.forEach((p, i) => { p.rank = i + 1; });

  // Award coins and leaderboard points to participating player accounts.
  const fin = players.map((p) => ({
    userId: p.userId,
    full_name: p.full_name,
    avatar: p.avatar,
    currentFrame: p.currentFrame,
    currentEffect: p.currentEffect,
    wpm: Math.round(p.wpm),
    accuracy: Math.round(p.accuracy),
    progress: Math.round(p.progress),
    done: p.done,
    finishMs: p.finishMs,
    rank: p.rank,
    coinsWon: 0,
  }));

  try {
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < fin.length && i < PODIUM_COINS.length; i++) {
        if (!fin[i].done) continue;
        const user = await tx.user.findUnique({ where: { id: fin[i].userId } });
        if (!user) continue;
        const coins = PODIUM_COINS[i];
        fin[i].coinsWon = coins;
        await tx.user.update({ where: { id: fin[i].userId }, data: { coin: { increment: coins } } });
      }
      // Each participating player earns score (raqobat uchun)
      for (const p of fin) {
        const user = await tx.user.findUnique({ where: { id: p.userId } });
        if (!user) continue;
        await tx.user.update({
          where: { id: p.userId },
          data: {
            score: { increment: CORRECT_BONUS },
            week_score: { increment: CORRECT_BONUS },
            month_score: { increment: CORRECT_BONUS },
          },
        });
        // WPM reytingga yozish (faqat public player hisoblariga)
        if (p.done && user) {
          await tx.typingRecord.create({
            data: {
              userId: p.userId,
              wpm: p.wpm,
              accuracy: p.accuracy,
              duration: Math.round(p.finishMs / 1000),
              chars: Math.round((p.wpm * 5 * (p.finishMs / 60000))),
              mode: 'race',
            },
          });
        }
      }
    });
  } catch (err) {
    console.error('[typing] natija saqlashda xato:', err);
  }

  await recordGame({
    type: 'typerace',
    roomCode: session.code,
    winnerId: fin[0]?.userId || null,
    winnerName: fin[0]?.full_name || null,
    totalPlayers: fin.length,
    totalBets: 0,
    commission: 0,
    payload: { lang: session.lang, top3: fin.slice(0, 3).map((f) => ({ name: f.full_name, wpm: f.wpm })) },
  });

  for (const p of session.players.values()) {
    unregisterGame(p.userId, 'typerace', session.code);
  }

  io.to(session.code).emit('typing:results', { final: fin });
  io.to(session.code).emit('typing:ended', { code: session.code });
}

// Lobi uchun: ochiq kutish xonalari
export function getTypingLobbyRooms() {
  const rooms = [];
  for (const session of sessions.values()) {
    if (session.status === 'waiting' && session.public) {
      const host = session.players.get(session.hostId);
      rooms.push({
        gameId: session.code,
        type: 'typerace',
        host: host
          ? { id: host.userId, full_name: host.full_name, avatar: host.avatar, currentFrame: host.currentFrame, currentEffect: host.currentEffect }
          : { id: session.hostId, full_name: 'Host', avatar: null, currentFrame: null, currentEffect: null },
        lang: session.lang,
        players: session.players.size,
        maxPlayers: 10,
        createdAt: session.createdAt,
      });
    }
  }
  return rooms;
}

export function setupTypingRace(io) {
  // Tozalash
  setInterval(() => {
    const now = Date.now();
    for (const [code, session] of sessions) {
      if (!session) continue;
      const ref = session.finishedAt || session.lastActivity || session.createdAt;
      const limit = session.status === 'finished' ? FINISHED_SESSION_MS : SESSION_IDLE_MS;
      if (now - ref > limit) sessions.delete(code);
    }
  }, CLEANUP_INTERVAL_MS);

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const userId = user.id;

    // ===== HOST: sessiya yaratish =====
    socket.on('typing:host', async (payload) => {
      try {
        const lang = ['uz', 'ru', 'en'].includes(payload?.lang) ? payload.lang : 'uz';
        const texts = await pickTexts(lang);
        if (!texts || texts.length === 0) {
          return emitError(socket, 'NO_TEXTS', 'Bu tilda hozircha matnlar yo\'q');
        }

        let code;
        do { code = randomCode(6); } while (sessions.has(code));

        const session = {
          code,
          hostId: userId,
          hostSocketId: socket.id,
          hostConnected: true,
          public: !!payload?.isPublic,
          lang,
          texts,
          players: new Map(),
          status: 'waiting',
          currentTextIdx: 0,
          startedAt: 0,
          createdAt: Date.now(),
          lastActivity: Date.now(),
        };

        // Add the player-host to the room as a regular participant when applicable.
        const hostUser = await fetchFullUser(userId);
        if (hostUser) {
          session.players.set(userId, buildPlayer(hostUser, socket.id));
          registerGame(userId, 'typerace', code);
        }

        sessions.set(code, session);
        socket.join(code);
        socket.data.typingHost = code;

        socket.emit('typing:hosted', {
          code,
          lang,
          textsCount: texts.length,
          texts: texts.map((t) => ({ id: t.id, title: t.title })),
          players: publicSession(session).players,
          status: 'waiting',
        });
      } catch (err) {
        console.error('typing:host error:', err);
        emitError(socket, 'HOST_FAILED', 'Sessiya yaratishda xatolik');
      }
    });

    // ===== HOST: boshlash =====
    socket.on('typing:start', () => {
      const code = socket.data.typingHost;
      const session = sessions.get(code);
      if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Sessiya topilmadi');
      if (session.hostId !== userId) return emitError(socket, 'NOT_HOST', 'Faqat xost');
      if (session.status !== 'waiting') return emitError(socket, 'ALREADY_STARTED', 'O\'yin boshlandi');
      if (session.players.size === 0) return emitError(socket, 'NO_PLAYERS', 'Hali hech kim qo\'shilmagan');

      session.status = 'playing';
      session.startedAt = Date.now();
      session.currentTextIdx = 0;
      session.lastActivity = Date.now();

      io.to(code).emit('typing:started', { code });
      io.to(code).emit('typing:text', {
        index: 0,
        title: session.texts[0].title,
        content: session.texts[0].content,
        startedAt: session.startedAt,
      });
    });

    // ===== HOST: keyingi matn / tugatish =====
    socket.on('typing:next_text', () => {
      const code = socket.data.typingHost;
      const session = sessions.get(code);
      if (!session || session.hostId !== userId) return;
      if (session.status !== 'playing') return;

      session.currentTextIdx += 1;
      session.lastActivity = Date.now();

      if (session.currentTextIdx >= session.texts.length) {
        // Hammasi tugadi - oxirgi natija
        finishRace(io, session);
        return;
      }
      // Matn o'rtasida yangi matn: progresslarni tozalamaymiz, umumiy o'yin
      io.to(code).emit('typing:text', {
        index: session.currentTextIdx,
        title: session.texts[session.currentTextIdx].title,
        content: session.texts[session.currentTextIdx].content,
        startedAt: session.startedAt,
      });
    });

    // ===== HOST: tugatish =====
    socket.on('typing:end', () => {
      const code = socket.data.typingHost;
      const session = sessions.get(code);
      if (!session || session.hostId !== userId) return;
      finishRace(io, session);
    });

    // ===== HOST: resync (refresh) =====
    socket.on('typing:host_resync', () => {
      const code = socket.data.typingHost;
      const session = sessions.get(code);
      if (!session) return;
      session.hostSocketId = socket.id;
      session.hostConnected = true;
      socket.join(code);
      socket.emit('typing:hosted', {
        code,
        lang: session.lang,
        textsCount: session.texts.length,
        texts: session.texts.map((t) => ({ id: t.id, title: t.title })),
        players: publicSession(session).players,
        status: session.status,
      });
    });

    // ===== O'YINCHI: qo'shilish =====
    socket.on('typing:join', async (payload) => {
      try {
        const { code } = payload || {};
        if (!code) return emitError(socket, 'INVALID_PAYLOAD', 'Kod kerak');
        const session = sessions.get(String(code).toUpperCase());
        if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Bunday sessiya topilmadi');
        if (session.status === 'finished') return emitError(socket, 'SESSION_ENDED', 'Sessiya tugagan');
        if (userGameMap.has(userId)) {
          const cur = userGameMap.get(userId);
          if (cur.type === 'typerace' && cur.id === session.code) {
            // allaqachon ichida
          } else {
            return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon boshqa o\'yindasiz');
          }
        }

        const dbUser = await fetchFullUser(userId);
        if (!dbUser) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');

        let player = session.players.get(userId);
        const isNew = !player;

        if (!player) {
          if (session.players.size >= MAX_PLAYERS) {
            return emitError(socket, 'SESSION_FULL', 'Sessiya to\'la (10 kishi)');
          }
          player = buildPlayer(dbUser, socket.id);
          session.players.set(userId, player);
          registerGame(userId, 'typerace', session.code);
        } else {
          player.socketId = socket.id;
          player.connected = true;
          registerGame(userId, 'typerace', session.code);
        }
        userSocketMap.set(userId, socket.id);
        socket.join(session.code);
        session.lastActivity = Date.now();

        socket.emit('typing:joined', { session: publicSession(session) });
        if (isNew) {
          socket.to(session.code).emit('typing:player_joined', publicSession(session));
        } else {
          socket.to(session.code).emit('typing:player_reconnected', publicSession(session));
        }
      } catch (err) {
        console.error('typing:join error:', err);
        emitError(socket, 'JOIN_FAILED', 'Qo\'shilishda xatolik');
      }
    });

    // ===== O'YINCHI: progress =====
    socket.on('typing:progress', (payload) => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'typerace') return;
      const session = sessions.get(entry.id);
      if (!session || session.status !== 'playing') return;

      const player = session.players.get(userId);
      if (!player || player.done) return;

      const { progress, wpm, accuracy } = payload || {};
      if (typeof progress === 'number' && Number.isFinite(progress)) {
        player.progress = Math.min(100, Math.max(0, progress));
      }
      if (typeof wpm === 'number' && Number.isFinite(wpm) && wpm >= 0 && wpm < 300) {
        player.wpm = wpm;
      }
      if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
        player.accuracy = Math.min(100, Math.max(0, accuracy));
      }
      session.lastActivity = Date.now();

      socket.to(session.code).emit('typing:progress_update', {
        userId,
        progress: player.progress,
        wpm: player.wpm,
        accuracy: player.accuracy,
      });
    });

    // ===== O'YINCHI: tugatdim =====
    socket.on('typing:done', (payload) => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'typerace') return;
      const session = sessions.get(entry.id);
      if (!session || session.status !== 'playing') return;

      const player = session.players.get(userId);
      if (!player || player.done) return;

      const { wpm, accuracy } = payload || {};
      player.done = true;
      player.finishMs = Date.now() - session.startedAt;
      if (typeof wpm === 'number' && Number.isFinite(wpm) && wpm >= 0 && wpm < 300) player.wpm = wpm;
      if (typeof accuracy === 'number' && Number.isFinite(accuracy)) player.accuracy = accuracy;
      player.progress = 100;
      player.rank = [...session.players.values()].filter((p) => p.done).length;

      io.to(session.code).emit('typing:done_update', {
        userId,
        wpm: player.wpm,
        accuracy: player.accuracy,
        rank: player.rank,
      });

      // Hammasi tugadimi?
      const allDone = [...session.players.values()].every((p) => p.done);
      if (allDone) finishRace(io, session);
    });

    // ===== O'YINCHI: chiqish =====
    socket.on('typing:leave', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'typerace') return;
      const session = sessions.get(entry.id);
      if (!session) { userGameMap.delete(userId); return; }
      session.players.delete(userId);
      unregisterGame(userId, 'typerace', session.code);
      socket.leave(session.code);
      socket.to(session.code).emit('typing:player_left', publicSession(session));
    });

    // ===== O'YINCHI: aktiv sessiyani tiklash =====
    socket.on('typing:get_active', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'typerace') return;
      const session = sessions.get(entry.id);
      if (!session || session.status === 'finished') {
        userGameMap.delete(userId);
        return;
      }
      const player = session.players.get(userId);
      if (!player) return;
      player.socketId = socket.id;
      player.connected = true;
      userSocketMap.set(userId, socket.id);
      socket.join(session.code);
      socket.emit('typing:joined', { session: publicSession(session) });
      if (session.status === 'playing') {
        socket.emit('typing:text', {
          index: session.currentTextIdx,
          title: session.texts[session.currentTextIdx].title,
          content: session.texts[session.currentTextIdx].content,
          startedAt: session.startedAt,
        });
      }
    });

    // ===== UZILISH =====
    socket.on('disconnect', () => {
      const hostCode = socket.data.typingHost;
      if (hostCode) {
        const session = sessions.get(hostCode);
        if (session && session.hostSocketId === socket.id) session.hostConnected = false;
      }
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'typerace') return;
      const session = sessions.get(entry.id);
      if (!session) return;
      const player = session.players.get(userId);
      if (player && player.socketId === socket.id) {
        player.connected = false;
        socket.to(session.code).emit('typing:player_disconnected', publicSession(session));
      }
    });
  });
}
