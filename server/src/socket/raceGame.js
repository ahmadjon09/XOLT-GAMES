// POYGA (RACE) - 2D ko'p o'yinchi poyga (2-4 o'yinchi, yo'l tanlash, to'siqlar bir xil seed bilan)
// G'oya: har bir o'yinchi o'z mashinasini boshqaradi (mobil: ekrandagi tugmalar),
// masofa (progress) client tomonidan hisoblanadi (typing race kabi), server
// pozitsiyalarni tarqatadi va yakuniy natijani qayd etadi.
import { prisma } from '../prisma/client.js';
import {
  emitError,
  fetchFullUser,
  buildPlayerData,
  sanitizePlayer,
  registerGame,
  userSocketMap,
  userGameMap,
  recordGame,
} from './shared.js';

const MAX_PLAYERS = 4;
const RECONNECT_TIMEOUT_MS = 30 * 1000;
const INACTIVE_CLEANUP_MS = 10 * 60 * 1000;
const FINISHED_CLEANUP_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const FINISH_WAIT_MS = 45 * 1000; // birinchi finisherdan keyin qancha kutish

// Yo'llar (treklar) — client bilan bir xil ma'nolar
const TRACKS = {
  city: { length: 1200, lanes: 3, density: 1.0 },
  desert: { length: 2000, lanes: 3, density: 0.75 },
  mountain: { length: 3000, lanes: 4, density: 1.25 },
};

// Yo'lda yig'ilishi mumkin bo'lgan coinlar chegarasi (anti-cheat)
const PICKUP_CAP = 60;
// Yakkaxon mashg'ulot uchun kichik rag'bat (farming bo'lmasligi uchun cheklangan)
const soloCoins = (pickups) => Math.min(10, Math.floor((pickups || 0) / 4));

// Mukofotlar (2+ o'yinchi bo'lsa): coin / ball
const REWARDS = [
  { coin: 15, score: 15 },
  { coin: 8, score: 8 },
  { coin: 4, score: 4 },
];

const sessions = new Map();
const disconnectTimers = new Map();

function sanitizeSession(s) {
  return {
    code: s.code,
    status: s.status,
    public: s.public,
    track: s.track,
    trackInfo: TRACKS[s.track] || TRACKS.city,
    seed: s.seed,
    hostId: s.hostId,
    startedAt: s.startedAt,
    players: s.players.map((p, i) => ({
      ...sanitizePlayer(p),
      userId: p.id,
      lane: i,
      ready: !!p.ready,
      progress: p.progress || 0,
      finished: !!p.finishedAt,
      finishTime: p.finishedAt ? p.finishedAt - s.startedAt : null,
      rank: p.rank || null,
    })),
    createdAt: s.createdAt,
  };
}

function emitSession(io, s) {
  io.to(s.code).emit('race:session', sanitizeSession(s));
}

function clearDisconnectTimer(code, userId) {
  const timers = disconnectTimers.get(code);
  if (timers && timers[userId]) {
    clearTimeout(timers[userId]);
    delete timers[userId];
  }
}

async function cleanupSession(code) {
  const s = sessions.get(code);
  const timers = disconnectTimers.get(code);
  if (timers) {
    Object.values(timers).forEach((t) => t && clearTimeout(t));
    disconnectTimers.delete(code);
  }
  if (s) {
    s.players.forEach((p) => {
      if (userGameMap.get(p.id)?.id === code) userGameMap.delete(p.id);
    });
  }
  sessions.delete(code);
}

// Poyga yakuni: o'yinchilarni tartiblash, mukofotlar, yozuv
async function finishRace(io, s) {
  try {
    s.status = 'finished';
    s.finishedAt = Date.now();

    // Reyting: avval finish qilganlar, keyin progress bo'yicha
    const ranked = s.players
      .slice()
      .sort((a, b) => {
        if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
        if (a.finishedAt) return -1;
        if (b.finishedAt) return 1;
        return (b.progress || 0) - (a.progress || 0);
      });
    ranked.forEach((p, i) => { p.rank = i + 1; });

    const starters = ranked.length;
    const multi = starters >= 2;

    // Mukofotlar (faqat 2+ o'yinchi poygasida)
    if (multi) {
      const updates = ranked.map((p, i) => {
        const r = REWARDS[i] || { coin: 0, score: 0 };
        const gain = r.coin + (p.pickups || 0);
        return prisma.user.update({
          where: { id: p.id },
          data: {
            coin: { increment: gain },
            score: { increment: r.score },
            week_score: { increment: r.score },
            month_score: { increment: r.score },
          },
        }).catch((e) => console.error(`[race:${s.code}] mukofot xatosi:`, e.message));
      });
      await Promise.all(updates);

      const winner = ranked[0];
      await recordGame({
        type: 'race',
        roomCode: s.code,
        winnerId: winner.id,
        winnerName: winner.full_name,
        totalPlayers: starters,
        totalBets: 0,
        commission: 0,
        payload: { track: s.track, ranks: ranked.map((p) => ({ id: p.id, rank: p.rank })) },
      });
    }

    // Yakkaxon mashg'ulot: yig'ilgan coinlarning kichik qismi beriladi
    if (!multi) {
      const soloUpdates = ranked
        .filter((p) => soloCoins(p.pickups || 0) > 0)
        .map((p) => prisma.user.update({
          where: { id: p.id },
          data: { coin: { increment: soloCoins(p.pickups || 0) } },
        }).catch((e) => console.error(`[race:${s.code}] coin xatosi:`, e.message)));
      await Promise.all(soloUpdates);
    }

    s.players.forEach((p) => {
      if (userGameMap.get(p.id)?.id === s.code) userGameMap.delete(p.id);
    });

    io.to(s.code).emit('race:end', {
      results: ranked.map((p, i) => ({
        userId: p.id,
        full_name: p.full_name,
        avatar: p.avatar,
        currentFrame: p.currentFrame,
        currentEffect: p.currentEffect,
        rank: i + 1,
        progress: Math.round(p.progress || 0),
        timeMs: p.finishedAt ? p.finishedAt - s.startedAt : null,
        coins: multi ? (REWARDS[i] || { coin: 0 }).coin + (p.pickups || 0) : soloCoins(p.pickups || 0),
        points: multi ? (REWARDS[i] || { score: 0 }).score : 0,
        pickups: p.pickups || 0,
        crashes: p.crashes || 0,
      })),
      track: s.track,
    });
  } catch (err) {
    console.error(`[race:${s.code}] yakunlashda xato:`, err);
  }
}

function maybeFinish(io, s) {
  if (s.status !== 'playing') return;
  const active = s.players.filter((p) => p.connected !== false);
  const unfinished = active.filter((p) => !p.finishedAt);
  if (unfinished.length === 0 || active.length === 0) {
    finishRace(io, s);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions) {
    if (!s) continue;
    // birinchi finisherdan keyin FINISH_WAIT_MS kutamiz va yopamiz
    if (s.status === 'playing' && s.firstFinishAt && now - s.firstFinishAt > FINISH_WAIT_MS) {
      finishRace(ioRef, s);
      }
    if (s.status === 'finished') {
      if (now - (s.finishedAt || s.lastActivity || s.createdAt) > FINISHED_CLEANUP_MS) cleanupSession(code);
    } else if (now - (s.lastActivity || s.createdAt) > INACTIVE_CLEANUP_MS) {
      cleanupSession(code);
    }
  }
}, CLEANUP_INTERVAL_MS);

let ioRef = null;

// Lobi uchun ochiq xonalar
export function getRaceLobbyRooms() {
  const rooms = [];
  for (const s of sessions.values()) {
    if (s.status === 'waiting' && s.public) {
      rooms.push({
        gameId: s.code,
        type: 'race',
        host: {
          id: s.hostId,
          full_name: (s.players.find((p) => p.id === s.hostId) || {}).full_name,
          avatar: (s.players.find((p) => p.id === s.hostId) || {}).avatar,
          currentFrame: (s.players.find((p) => p.id === s.hostId) || {}).currentFrame,
          currentEffect: (s.players.find((p) => p.id === s.hostId) || {}).currentEffect,
        },
        track: s.track,
        players: s.players.length,
        maxPlayers: MAX_PLAYERS,
        createdAt: s.createdAt,
      });
    }
  }
  return rooms;
}

export function setupRaceGame(io) {
  ioRef = io;

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    if (socket.data.user.kind !== 'user') return;

    // Aktiv poygani tiklash (refresh)
    socket.on('race:get_active', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'race') return;
      const s = sessions.get(entry.id);
      if (!s) return;
      if (s.status === 'waiting' || s.status === 'playing') {
        const p = s.players.find((x) => x.id === userId);
        if (p) {
          p.connected = true;
          p.socketId = socket.id;
          userSocketMap.set(userId, socket.id);
          socket.join(s.code);
          clearDisconnectTimer(s.code, userId);
          socket.emit('race:active', { session: sanitizeSession(s) });
          emitSession(io, s);
        }
      } else {
        userGameMap.delete(userId);
      }
    });

    // Xona yaratish (yo'l tanlash)
    socket.on('race:host', async (payload) => {
      try {
        const { track, isPublic } = payload || {};
        const tr = TRACKS[track] ? track : 'city';
        if (userGameMap.has(userId)) return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon aktiv o\'yindasiz');

        const user = await fetchFullUser(userId);
        if (!user) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');

        let code;
        do {
          code = String(Math.floor(100000 + Math.random() * 900000));
        } while (sessions.has(code));

        sessions.set(code, {
          code,
          status: 'waiting',
          public: !!isPublic,
          track: tr,
          seed: Math.floor(Math.random() * 2 ** 31),
          hostId: userId,
          startedAt: null,
          firstFinishAt: null,
          players: [buildPlayerData(user, socket.id)],
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });

        registerGame(userId, 'race', code);
        userSocketMap.set(userId, socket.id);
        socket.join(code);
        // seed ham yuboriladi — aks holda xost boshqacha to'siqlar ko'rardi
        const st = sessions.get(code);
        socket.emit('race:hosted', {
          code,
          track: tr,
          seed: st.seed,
          hostId: userId,
          players: sanitizeSession(st).players,
        });
      } catch (err) {
        console.error('race:host error:', err);
        emitError(socket, 'HOST_FAILED', 'Xona yaratishda xatolik');
      }
    });

    // Xonaga qo'shilish
    socket.on('race:join', async (payload) => {
      try {
        const { code: c } = payload || {};
        const code = String(c || '').trim();
        const s = sessions.get(code);
        if (!s) return emitError(socket, 'GAME_NOT_FOUND', 'Xona topilmadi');
        if (s.status !== 'waiting') return emitError(socket, 'GAME_NOT_JOINABLE', 'Poyga allaqachon boshlangan');
        if (s.players.length >= MAX_PLAYERS) return emitError(socket, 'GAME_FULL', 'Xona to\'la (4 o\'yinchi)');
        if (s.players.some((p) => p.id === userId)) return emitError(socket, 'ALREADY_IN_GAME', 'Allaqachon xondasiz');
        if (userGameMap.has(userId)) return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon aktiv o\'yindasiz');

        const user = await fetchFullUser(userId);
        if (!user) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');

        const p = buildPlayerData(user, socket.id);
        s.players.push(p);
        s.lastActivity = Date.now();

        registerGame(userId, 'race', code);
        userSocketMap.set(userId, socket.id);
        socket.join(code);

        socket.emit('race:joined', { session: sanitizeSession(s) });
        io.to(code).emit('race:player_joined', sanitizeSession(s));
      } catch (err) {
        console.error('race:join error:', err);
        emitError(socket, 'JOIN_FAILED', 'Qo\'shilishda xatolik');
      }
    });

    // Boshlash (faqat xost)
    socket.on('race:start', () => {
      try {
        const entry = userGameMap.get(userId);
        if (!entry || entry.type !== 'race') return;
        const s = sessions.get(entry.id);
        if (!s) return;
        if (s.hostId !== userId) return emitError(socket, 'NOT_HOST', 'Faqat xost boshlay oladi');
        if (s.status !== 'waiting') return emitError(socket, 'ALREADY_STARTED', 'Poyga allaqachon boshlangan');

        s.status = 'playing';
        s.startedAt = Date.now() + 4000; // 3-2-1-GO countdown
        s.lastActivity = Date.now();
        s.players.forEach((p) => { p.progress = 0; p.finishedAt = null; p.rank = null; });

        io.to(s.code).emit('race:started', sanitizeSession(s));
      } catch (err) {
        console.error('race:start error:', err);
        emitError(socket, 'START_FAILED', 'Boshlashda xatolik');
      }
    });

    // Progress (masofa, metr) — client hisoblaydi, server tarqatadi
    socket.on('race:progress', (payload) => {
      try {
        const { distance } = payload || {};
        const entry = userGameMap.get(userId);
        if (!entry || entry.type !== 'race') return;
        const s = sessions.get(entry.id);
        if (!s || s.status !== 'playing') return;
        const p = s.players.find((x) => x.id === userId);
        if (!p) return;
        const d = Math.max(0, Math.min(s.finishedAt ? Infinity : (TRACKS[s.track] || TRACKS.city).length * 1.2, Number(distance) || 0));
        if (d > (p.progress || 0)) p.progress = d;
        s.lastActivity = Date.now();
        socket.to(s.code).emit('race:progress', { userId, distance: p.progress });
      } catch (err) {
        // jim — progress juda tez keladi
      }
    });

    // Finish
    socket.on('race:finish', (payload) => {
      try {
        const { distance, coins, crashes } = payload || {};
        const entry = userGameMap.get(userId);
        if (!entry || entry.type !== 'race') return;
        const s = sessions.get(entry.id);
        if (!s || s.status !== 'playing') return;
        const p = s.players.find((x) => x.id === userId);
        if (!p || p.finishedAt) return;
        const now = Date.now();
        p.finishedAt = Math.max(now, s.startedAt || now);
        p.progress = (TRACKS[s.track] || TRACKS.city).length;
        // Yo'lda yig'ilgan coinlar (cheklov bilan — anti-cheat)
        p.pickups = Math.max(0, Math.min(PICKUP_CAP, Number(coins) || 0));
        p.crashes = Math.max(0, Math.min(999, Number(crashes) || 0));
        if (!s.firstFinishAt) s.firstFinishAt = now;
        s.lastActivity = now;
        io.to(s.code).emit('race:player_finish', { userId, timeMs: p.finishedAt - (s.startedAt || now) });
        maybeFinish(io, s);
      } catch (err) {
        console.error('race:finish error:', err);
      }
    });

    // Chiqish
    socket.on('race:leave', () => {
      try {
        const entry = userGameMap.get(userId);
        if (!entry || entry.type !== 'race') return;
        const s = sessions.get(entry.id);
        if (!s) return;
        const p = s.players.find((x) => x.id === userId);
        socket.leave(s.code);
        clearDisconnectTimer(s.code, userId);
        io.to(s.code).emit('race:player_left', { userId });
        s.players = s.players.filter((x) => x.id !== userId);
        userGameMap.delete(userId);
        s.lastActivity = Date.now();

        if (s.players.length === 0) {
          cleanupSession(s.code);
          return;
        }
        // Xost ketdi — yangi xost
        if (s.hostId === userId) s.hostId = s.players[0].id;
        if (s.status === 'playing') {
          maybeFinish(io, s);
        } else {
          emitSession(io, s);
        }
      } catch (err) {
        console.error('race:leave error:', err);
        emitError(socket, 'LEAVE_FAILED', 'Chiqishda xatolik');
      }
    });

    socket.on('disconnect', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'race') return;
      const s = sessions.get(entry.id);
      if (!s) return;
      const p = s.players.find((x) => x.id === userId);
      if (!p) return;
      p.connected = false;
      s.lastActivity = Date.now();

      if (!disconnectTimers.has(s.code)) disconnectTimers.set(s.code, {});
      disconnectTimers.get(s.code)[userId] = setTimeout(async () => {
        const cur = sessions.get(s.code);
        if (!cur) return;
        const pp = cur.players.find((x) => x.id === userId);
        if (pp && pp.connected) return;
        cur.players = cur.players.filter((x) => x.id !== userId);
        userGameMap.delete(userId);
        if (cur.players.length === 0) { cleanupSession(cur.code); return; }
        if (cur.hostId === userId) cur.hostId = cur.players[0].id;
        io.to(cur.code).emit('race:player_left', { userId });
        if (cur.status === 'playing') maybeFinish(io, cur);
        else emitSession(io, cur);
      }, RECONNECT_TIMEOUT_MS);
    });
  });
}
