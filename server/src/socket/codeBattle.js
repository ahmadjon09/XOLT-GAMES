// CODE BATTLE - kod ko'rsatiladi, output nima chiqishini topish
// Teacher savollar yaratadi (kategoriya: js, python, csharp, java, php, sql...)
// Host (teacher yoki admin) sessiya ochadi, 10 tagacha o'quvchi qo'shiladi
// Tezlik bo'yicha ball (Kahoot uslubida)
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
const REVEAL_DELAY_MS = 5000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const FINISHED_SESSION_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const PODIUM_COINS = [80, 50, 25];
const CORRECT_BONUS = 3;

const sessions = new Map();
const timers = new Map(); // code -> { questionTimer, revealTimer }

const CATEGORIES = ['js', 'python', 'csharp', 'java', 'php', 'sql'];

function buildPlayer(user, socketId) {
  return {
    userId: user.id,
    full_name: user.full_name,
    avatar: user.avatar,
    currentFrame: user.currentFrame || null,
    currentEffect: user.currentEffect || null,
    socketId,
    connected: true,
    score: 0,
    correctCount: 0,
    answers: {},
  };
}

function publicSession(session) {
  return {
    code: session.code,
    category: session.category,
    status: session.status,
    hostConnected: session.hostConnected,
    questionsCount: session.questions.length,
    currentIndex: session.currentIndex,
    players: [...session.players.values()].map((p) => ({
      userId: p.userId,
      full_name: p.full_name,
      avatar: p.avatar,
      currentFrame: p.currentFrame,
      currentEffect: p.currentEffect,
      connected: p.connected,
      score: p.score,
      correctCount: p.correctCount,
      answered: p.answers[session.currentIndex] !== undefined,
    })),
  };
}

function clearTimers(code) {
  const t = timers.get(code);
  if (t) {
    if (t.questionTimer) clearTimeout(t.questionTimer);
    if (t.revealTimer) clearTimeout(t.revealTimer);
    timers.delete(code);
  }
}

function revealQuestion(io, session) {
  const q = session.questions[session.currentIndex];
  if (!q) return;
  session.questionEnded = true;
  session.lastActivity = Date.now();

  const results = [...session.players.values()].map((p) => ({
    userId: p.userId,
    score: p.score,
    correctCount: p.correctCount,
    answer: p.answers[session.currentIndex] ?? null,
  })).sort((a, b) => b.score - a.score);

  io.to(session.code).emit('code:reveal', {
    index: session.currentIndex,
    correctAnswer: q.answer,
    explanation: q.explanation || null,
    results,
  });

  const t = timers.get(session.code) || {};
  t.revealTimer = setTimeout(() => advance(io, session), REVEAL_DELAY_MS);
  timers.set(session.code, t);
}

function sendQuestion(io, session) {
  const q = session.questions[session.currentIndex];
  const timeLimit = q.timeLimit || 20;
  session.questionEnded = false;
  session.questionEndsAt = Date.now() + timeLimit * 1000;
  session.lastActivity = Date.now();

  io.to(session.code).emit('code:question', {
    index: session.currentIndex,
    totalQuestions: session.questions.length,
    title: q.title,
    code: q.code,
    category: q.category,
    timeLimit,
    points: q.points,
    endsAt: session.questionEndsAt,
  });

  const t = timers.get(session.code) || {};
  t.questionTimer = setTimeout(() => {
    const cur = sessions.get(session.code);
    if (cur && cur.status === 'playing' && cur.currentIndex === session.currentIndex) {
      revealQuestion(io, cur);
    }
  }, timeLimit * 1000 + 200);
  timers.set(session.code, t);
}

function advance(io, session) {
  clearTimers(session.code);
  if (session.status !== 'playing') return;
  session.currentIndex += 1;
  if (session.currentIndex >= session.questions.length) {
    finishBattle(io, session);
    return;
  }
  sendQuestion(io, session);
}

async function finishBattle(io, session) {
  clearTimers(session.code);
  session.status = 'finished';
  session.finishedAt = Date.now();
  session.lastActivity = Date.now();

  const final = [...session.players.values()]
    .map((p) => ({
      userId: p.userId,
      full_name: p.full_name,
      avatar: p.avatar,
      currentFrame: p.currentFrame,
      currentEffect: p.currentEffect,
      score: p.score,
      correctCount: p.correctCount,
      coinsWon: 0,
    }))
    .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount);

  try {
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < final.length && i < PODIUM_COINS.length; i++) {
        if (final[i].score <= 0) continue;
        const coins = PODIUM_COINS[i];
        final[i].coinsWon = coins;
        await tx.user.update({ where: { id: final[i].userId }, data: { coin: { increment: coins } } });
      }
      for (const p of final) {
        if (p.correctCount > 0) {
          await tx.user.update({
            where: { id: p.userId },
            data: {
              score: { increment: p.correctCount * CORRECT_BONUS },
              week_score: { increment: p.correctCount * CORRECT_BONUS },
              month_score: { increment: p.correctCount * CORRECT_BONUS },
            },
          });
        }
      }
    });
  } catch (err) {
    console.error('[codebattle] natija saqlashda xato:', err);
  }

  await recordGame({
    type: 'codebattle',
    roomCode: session.code,
    winnerId: final[0]?.userId || null,
    winnerName: final[0]?.full_name || null,
    totalPlayers: final.length,
    totalBets: 0,
    commission: 0,
    payload: { category: session.category, top3: final.slice(0, 3).map((f) => ({ name: f.full_name, score: f.score })) },
  });

  for (const p of session.players.values()) {
    unregisterGame(p.userId, 'codebattle', session.code);
  }

  io.to(session.code).emit('code:results', { final, podiumCoins: PODIUM_COINS });
  io.to(session.code).emit('code:ended', { code: session.code });
}

export function setupCodeBattle(io) {
  setInterval(() => {
    const now = Date.now();
    for (const [code, session] of sessions) {
      if (!session) continue;
      const ref = session.finishedAt || session.lastActivity || session.createdAt;
      const limit = session.status === 'finished' ? FINISHED_SESSION_MS : SESSION_IDLE_MS;
      if (now - ref > limit) {
        clearTimers(code);
        sessions.delete(code);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const userId = user.id;

    // ===== HOST: sessiya =====
    socket.on('code:host', async (payload) => {
      try {
        const category = CATEGORIES.includes(payload?.category) ? payload.category : 'js';
        const count = Math.min(10, Math.max(3, Number(payload?.count) || 5));

        const questions = await prisma.codeQuestion.findMany({
          where: { active: true, category },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        if (questions.length === 0) {
          return emitError(socket, 'NO_QUESTIONS', 'Bu kategoriyada savollar yo\'q. Teacherdan qo\'shishni so\'rang');
        }
        const picked = [...questions].sort(() => Math.random() - 0.5).slice(0, Math.min(count, questions.length));

        let code;
        do { code = randomCode(6); } while (sessions.has(code));

        const session = {
          code,
          category,
          questions: picked.map((q) => ({
            id: q.id,
            title: q.title,
            code: q.code,
            answer: q.answer,
            explanation: q.explanation,
            category: q.category,
            timeLimit: q.timeLimit,
            points: q.points,
          })),
          hostId: userId,
          hostSocketId: socket.id,
          hostConnected: true,
          players: new Map(),
          status: 'waiting',
          currentIndex: -1,
          createdAt: Date.now(),
          lastActivity: Date.now(),
        };
        sessions.set(code, session);
        socket.join(code);
        socket.data.codeHost = code;

        socket.emit('code:hosted', {
          code,
          category,
          questionsCount: picked.length,
          players: [],
          status: 'waiting',
        });
      } catch (err) {
        console.error('code:host error:', err);
        emitError(socket, 'HOST_FAILED', 'Sessiya yaratishda xatolik');
      }
    });

    // ===== HOST: start =====
    socket.on('code:start', () => {
      const code = socket.data.codeHost;
      const session = sessions.get(code);
      if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Sessiya topilmadi');
      if (session.hostId !== userId) return emitError(socket, 'NOT_HOST', 'Faqat xost');
      if (session.status !== 'waiting') return emitError(socket, 'ALREADY_STARTED', 'O\'yin boshlandi');
      if (session.players.size === 0) return emitError(socket, 'NO_PLAYERS', 'Hali hech kim qo\'shilmagan');

      session.status = 'playing';
      session.currentIndex = 0;
      session.lastActivity = Date.now();
      io.to(code).emit('code:started', { code });
      sendQuestion(io, session);
    });

    // ===== HOST: next =====
    socket.on('code:next', () => {
      const code = socket.data.codeHost;
      const session = sessions.get(code);
      if (!session || session.hostId !== userId) return;
      if (session.status !== 'playing') return;
      advance(io, session);
    });

    // ===== HOST: end =====
    socket.on('code:end', () => {
      const code = socket.data.codeHost;
      const session = sessions.get(code);
      if (!session || session.hostId !== userId) return;
      if (session.status !== 'playing') return;
      clearTimers(code);
      session.currentIndex = session.questions.length;
      finishBattle(io, session);
    });

    // ===== HOST: resync =====
    socket.on('code:host_resync', () => {
      const code = socket.data.codeHost;
      const session = sessions.get(code);
      if (!session) return;
      session.hostSocketId = socket.id;
      session.hostConnected = true;
      socket.join(code);
      socket.emit('code:hosted', {
        code,
        category: session.category,
        questionsCount: session.questions.length,
        players: publicSession(session).players,
        status: session.status,
      });
      if (session.status === 'playing' && session.currentIndex >= 0) {
        const q = session.questions[session.currentIndex];
        socket.emit('code:host_question', {
          index: session.currentIndex,
          title: q.title,
          code: q.code,
          answer: q.answer,
          explanation: q.explanation,
          timeLimit: q.timeLimit,
          points: q.points,
          endsAt: session.questionEndsAt || null,
        });
      }
    });

    // ===== O'YINCHI: join =====
    socket.on('code:join', async (payload) => {
      try {
        const { code } = payload || {};
        if (!code) return emitError(socket, 'INVALID_PAYLOAD', 'Kod kerak');
        const session = sessions.get(String(code).toUpperCase());
        if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Bunday sessiya topilmadi');
        if (session.status === 'finished') return emitError(socket, 'SESSION_ENDED', 'Sessiya tugagan');
        if (userGameMap.has(userId)) {
          const cur = userGameMap.get(userId);
          if (cur.type === 'codebattle' && cur.id === session.code) {
            // ichida
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
          registerGame(userId, 'codebattle', session.code);
        } else {
          player.socketId = socket.id;
          player.connected = true;
          registerGame(userId, 'codebattle', session.code);
        }
        userSocketMap.set(userId, socket.id);
        socket.join(session.code);
        session.lastActivity = Date.now();

        socket.emit('code:joined', {
          session: publicSession(session),
          currentQuestion:
            session.status === 'playing' && session.currentIndex >= 0 && !session.questionEnded
              ? {
                  index: session.currentIndex,
                  totalQuestions: session.questions.length,
                  title: session.questions[session.currentIndex].title,
                  code: session.questions[session.currentIndex].code,
                  category: session.questions[session.currentIndex].category,
                  timeLimit: session.questions[session.currentIndex].timeLimit,
                  points: session.questions[session.currentIndex].points,
                  endsAt: session.questionEndsAt || Date.now() + 1000,
                }
              : null,
        });
        if (isNew) socket.to(session.code).emit('code:player_joined', publicSession(session));
        else socket.to(session.code).emit('code:player_reconnected', publicSession(session));
      } catch (err) {
        console.error('code:join error:', err);
        emitError(socket, 'JOIN_FAILED', 'Qo\'shilishda xatolik');
      }
    });

    // ===== O'YINCHI: javob =====
    socket.on('code:answer', (payload) => {
      try {
        const { code, questionIndex, answer } = payload || {};
        const session = sessions.get(String(code || '').toUpperCase());
        if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Sessiya topilmadi');
        if (session.status !== 'playing') return emitError(socket, 'NOT_PLAYING', 'Hozir savol yo\'q');
        if (session.currentIndex !== questionIndex) return emitError(socket, 'WRONG_QUESTION', 'Bu savol tugagan');
        if (session.questionEnded) return emitError(socket, 'TIME_UP', 'Vaqt tugadi');

        const player = session.players.get(userId);
        if (!player) return emitError(socket, 'NOT_IN_SESSION', 'Siz sessiyada emassiz');
        if (player.answers[questionIndex] !== undefined) {
          return emitError(socket, 'ALREADY_ANSWERED', 'Siz allaqachon javob bergansiz');
        }

        const q = session.questions[questionIndex];
        const userAnswer = String(answer ?? '').trim();
        player.answers[questionIndex] = userAnswer;

        const now = Date.now();
        const remaining = Math.max(0, (session.questionEndsAt || now) - now);
        const ratio = remaining / ((q.timeLimit || 20) * 1000);

        // Javobni solishtirish: probel va katta-kichik harflarga chidamli
        const normalize = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
        const isCorrect = normalize(userAnswer) === normalize(q.answer);
        let points = 0;
        if (isCorrect) {
          points = Math.max(1, Math.round(q.points * (0.5 + 0.5 * ratio)));
          player.score += points;
          player.correctCount += 1;
        }

        socket.emit('code:answer_result', { questionIndex, correct: isCorrect, points });
        socket.to(session.code).emit('code:player_answered', {
          userId,
          answered: true,
          correct: isCorrect,
          score: player.score,
        });
      } catch (err) {
        console.error('code:answer error:', err);
        emitError(socket, 'ANSWER_FAILED', 'Javob qayta ishlanmadi');
      }
    });

    // ===== O'YINCHI: chiqish =====
    socket.on('code:leave', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'codebattle') return;
      const session = sessions.get(entry.id);
      if (!session) { userGameMap.delete(userId); return; }
      session.players.delete(userId);
      unregisterGame(userId, 'codebattle', session.code);
      socket.leave(session.code);
      socket.to(session.code).emit('code:player_left', publicSession(session));
    });

    // ===== O'YINCHI: aktiv =====
    socket.on('code:get_active', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'codebattle') return;
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
      socket.emit('code:joined', {
        session: publicSession(session),
        currentQuestion:
          session.status === 'playing' && session.currentIndex >= 0 && !session.questionEnded
            ? {
                index: session.currentIndex,
                totalQuestions: session.questions.length,
                title: session.questions[session.currentIndex].title,
                code: session.questions[session.currentIndex].code,
                category: session.questions[session.currentIndex].category,
                timeLimit: session.questions[session.currentIndex].timeLimit,
                points: session.questions[session.currentIndex].points,
                endsAt: session.questionEndsAt || Date.now() + 1000,
              }
            : null,
      });
    });

    socket.on('disconnect', () => {
      const hostCode = socket.data.codeHost;
      if (hostCode) {
        const session = sessions.get(hostCode);
        if (session && session.hostSocketId === socket.id) session.hostConnected = false;
      }
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'codebattle') return;
      const session = sessions.get(entry.id);
      if (!session) return;
      const player = session.players.get(userId);
      if (player && player.socketId === socket.id) {
        player.connected = false;
        socket.to(session.code).emit('code:player_disconnected', publicSession(session));
      }
    });
  });
}
