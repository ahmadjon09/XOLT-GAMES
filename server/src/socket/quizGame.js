// QUIZ GAME - Kahoot uslubidagi viktorina
// O'qituvchi savollar yaratadi (matn + rasm), xost qiladi, QR/kod tarqatadi
// O'quvchilar kod yoki QR orqali qo'shiladi, tezlik bo'yicha ball yig'iladi
import { prisma } from '../prisma/client.js';
import {
  emitError,
  fetchFullUser,
  sanitizePlayer,
  registerGame,
  unregisterGame,
  userSocketMap,
  userGameMap,
  recordGame,
} from './shared.js';
import { randomCode } from '../utils/helpers.js';

const REVEAL_DELAY_MS = 6000; // javoblar ochilgandan keyingi pauza
const SESSION_IDLE_MS = 30 * 60 * 1000; // sessiya 30 daqiqa harakatsiz bo'lsa o'chadi
const FINISHED_SESSION_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_PLAYERS = 200;

// Podium mukofotlari (coin)
const PODIUM_COINS = [100, 60, 30];
// Har to'g'ri javob uchun leaderboard balli
const CORRECT_SCORE_POINTS = 5;

const sessions = new Map(); // code -> session
const hostSessionMap = new Map(); // staffId -> code (host reconnect uchun)
const sessionTimers = new Map(); // code -> { questionTimer, revealTimer }

// O'yinchi (o'quvchi) ma'lumotlari
function buildQuizPlayer(user, socketId) {
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
    answers: {}, // questionIndex -> variantIndex
  };
}

// Sessiyaning ommaviy holati (o'quvchiga ko'rinadigan)
function publicSession(session) {
  return {
    code: session.code,
    quizName: session.quizName,
    status: session.status,
    hostConnected: session.hostConnected,
    totalQuestions: session.questions.length,
    currentIndex: session.currentIndex,
    players: [...session.players.values()].map((p) => ({
      userId: p.userId,
      full_name: p.full_name,
      avatar: p.avatar,
      currentFrame: p.currentFrame,
      currentEffect: p.currentEffect,
      score: p.score,
      correctCount: p.correctCount,
      connected: p.connected,
    })),
  };
}

// Xost uchun to'liq holat
function hostState(session) {
  return {
    code: session.code,
    quizName: session.quizName,
    status: session.status,
    totalQuestions: session.questions.length,
    currentIndex: session.currentIndex,
    players: [...session.players.values()].map((p) => ({
      userId: p.userId,
      full_name: p.full_name,
      avatar: p.avatar,
      currentFrame: p.currentFrame,
      currentEffect: p.currentEffect,
      score: p.score,
      correctCount: p.correctCount,
      connected: p.connected,
      answered: p.answers[session.currentIndex] !== undefined,
    })),
  };
}

function clearTimers(code) {
  const t = sessionTimers.get(code);
  if (t) {
    if (t.questionTimer) clearTimeout(t.questionTimer);
    if (t.revealTimer) clearTimeout(t.revealTimer);
    sessionTimers.delete(code);
  }
}

// Javob oynasi tugaganda - to'g'ri javobni ochish
function revealQuestion(io, session) {
  const q = session.questions[session.currentIndex];
  if (!q) return;

  session.questionEnded = true;
  session.lastActivity = Date.now();

  const results = [...session.players.values()]
    .map((p) => ({
      userId: p.userId,
      full_name: p.full_name,
      score: p.score,
      correctCount: p.correctCount,
      answerIndex: p.answers[session.currentIndex] ?? null,
    }))
    .sort((a, b) => b.score - a.score);

  io.to(session.code).emit('quiz:reveal', {
    index: session.currentIndex,
    correctIndex: session.questions[session.currentIndex].variants.findIndex((v) => v === session.questions[session.currentIndex].answer),
    correctAnswer: q.answer,
    results,
  });

  // 6 sekunddan keyin avtomatik keyingi savol (xost oldinroq bosishi mumkin)
  const t = sessionTimers.get(session.code) || {};
  t.revealTimer = setTimeout(() => {
    advanceQuestion(io, session);
  }, REVEAL_DELAY_MS);
  sessionTimers.set(session.code, t);
}

function advanceQuestion(io, session) {
  clearTimers(session.code);

  if (session.status !== 'playing') return;

  session.currentIndex += 1;

  if (session.currentIndex >= session.questions.length) {
    finishQuiz(io, session);
    return;
  }

  sendQuestion(io, session);
}

function sendQuestion(io, session) {
  const q = session.questions[session.currentIndex];
  const timeLimit = q.timeLimit || 20;

  session.answeredCount = 0;
  session.questionEnded = false;
  session.questionEndsAt = Date.now() + timeLimit * 1000;
  session.lastActivity = Date.now();

  io.to(session.code).emit('quiz:question', {
    index: session.currentIndex,
    totalQuestions: session.questions.length,
    text: q.text,
    variants: q.variants,
    image: q.image || null,
    timeLimit,
    points: q.points,
    endsAt: Date.now() + timeLimit * 1000,
  });

  const t = sessionTimers.get(session.code) || {};
  t.questionTimer = setTimeout(() => {
    const current = sessions.get(session.code);
    if (current && current.status === 'playing' && current.currentIndex === session.currentIndex) {
      revealQuestion(io, current);
    }
  }, timeLimit * 1000 + 200);
  sessionTimers.set(session.code, t);
}

async function finishQuiz(io, session) {
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

  // Top-3 ga coin va hammaga leaderball
  const coinMap = {};
  try {
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < final.length && i < PODIUM_COINS.length; i++) {
        if (final[i].score <= 0) continue;
        const coins = PODIUM_COINS[i];
        coinMap[final[i].userId] = coins;
        final[i].coinsWon = coins;
        await tx.user.update({
          where: { id: final[i].userId },
          data: { coin: { increment: coins } },
        });
      }
      // To'g'ri javoblar uchun leaderboard ball
      for (const p of final) {
        if (p.correctCount > 0) {
          await tx.user.update({
            where: { id: p.userId },
            data: {
              score: { increment: p.correctCount * CORRECT_SCORE_POINTS },
              week_score: { increment: p.correctCount * CORRECT_SCORE_POINTS },
              month_score: { increment: p.correctCount * CORRECT_SCORE_POINTS },
            },
          });
        }
      }
    });
  } catch (err) {
    console.error('[quizgame] natija saqlashda xato:', err);
  }

  await recordGame({
    type: 'quiz',
    roomCode: session.code,
    winnerId: final[0]?.userId || null,
    winnerName: final[0]?.full_name || null,
    totalPlayers: final.length,
    totalBets: 0,
    commission: 0,
    payload: { quizName: session.quizName, top3: final.slice(0, 3).map((f) => ({ id: f.userId, name: f.full_name, score: f.score })) },
  });

  // O'quvchilarni o'yin ro'yxatidan chiqaramiz
  for (const p of session.players.values()) {
    unregisterGame(p.userId, 'quiz', session.code);
  }

  io.to(session.code).emit('quiz:results', {
    final,
    podiumCoins: PODIUM_COINS,
    quizName: session.quizName,
  });
  io.to(session.code).emit('quiz:ended', { code: session.code });
}

export function setupQuizGame(io) {
  // Sessiya tozalash
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

    // --- XOST: sessiya yaratish ---
    socket.on('quiz:host', async (payload) => {
      try {
        if (user.kind !== 'staff') return emitError(socket, 'NOT_ALLOWED', 'Faqat xodim xost qila oladi');
        if (!['TEACHER', 'ADMIN'].includes(user.role)) return emitError(socket, 'NOT_ALLOWED', 'Ruxsat yoq');

        const { quizId } = payload || {};
        if (!quizId) return emitError(socket, 'INVALID_PAYLOAD', 'quizId kerak');

        const quiz = await prisma.quiz.findUnique({
          where: { id: quizId },
          include: { questions: { orderBy: { sortOrder: 'asc' } } },
        });
        if (!quiz) return emitError(socket, 'QUIZ_NOT_FOUND', 'Viktorina topilmadi');
        if (quiz.questions.length === 0) return emitError(socket, 'NO_QUESTIONS', 'Viktorinada savollar yo\'q');
        if (user.role === 'TEACHER' && quiz.createdById !== userId) {
          return emitError(socket, 'NOT_OWNER', 'Bu viktorina sizga tegishli emas');
        }

        // Kod yaratish (band bo'lmasa)
        let code;
        do {
          code = randomCode(6);
        } while (sessions.has(code));

        const session = {
          id: `${code}-${Date.now()}`,
          code,
          quizId: quiz.id,
          quizName: quiz.name,
          questions: quiz.questions.map((q) => ({
            index: 0,
            text: q.text,
            variants: q.variants,
            answer: q.answer, // xostga kerak bo'ladi
            image: q.image,
            timeLimit: q.timeLimit,
            points: q.points,
          })),
          hostId: userId,
          hostSocketId: socket.id,
          hostConnected: true,
          players: new Map(),
          status: 'waiting',
          currentIndex: -1,
          answeredCount: 0,
          createdAt: Date.now(),
          lastActivity: Date.now(),
        };

        sessions.set(code, session);
        hostSessionMap.set(userId, code);
        socket.join(code);
        socket.data.quizHost = code;

        socket.emit('quiz:hosted', {
          code,
          quizName: quiz.name,
          questionsCount: quiz.questions.length,
          players: [],
          status: 'waiting',
        });
      } catch (err) {
        console.error('quiz:host error:', err);
        emitError(socket, 'HOST_FAILED', 'Sessiya yaratishda xatolik');
      }
    });

    // --- XOST: o'yinni boshlash ---
    socket.on('quiz:start', () => {
      const code = socket.data.quizHost;
      const session = sessions.get(code);
      if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Sessiya topilmadi');
      if (session.hostId !== userId) return emitError(socket, 'NOT_HOST', 'Faqat xost');
      if (session.status !== 'waiting') return emitError(socket, 'ALREADY_STARTED', 'O\'yin allaqachon boshlangan');
      if (session.players.size === 0) return emitError(socket, 'NO_PLAYERS', 'Hali hech kim qo\'shilmagan');

      session.status = 'playing';
      session.currentIndex = 0;
      session.lastActivity = Date.now();

      io.to(code).emit('quiz:started', { code });
      sendQuestion(io, session);
    });

    // --- XOST: keyingi savol (revealdan keyin tezlatish) ---
    socket.on('quiz:next', () => {
      const code = socket.data.quizHost;
      const session = sessions.get(code);
      if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Sessiya topilmadi');
      if (session.hostId !== userId) return emitError(socket, 'NOT_HOST', 'Faqat xost');
      if (session.status !== 'playing') return emitError(socket, 'NOT_PLAYING', 'O\'yin davom etmayapti');
      if (session.currentIndex < 0) return;

      advanceQuestion(io, session);
    });

    // --- XOST: o'yinchini haydash ---
    socket.on('quiz:kick', (payload) => {
      const code = socket.data.quizHost;
      const session = sessions.get(code);
      if (!session) return;
      if (session.hostId !== userId) return;

      const { targetUserId } = payload || {};
      const player = session.players.get(targetUserId);
      if (!player) return;

      session.players.delete(targetUserId);
      unregisterGame(targetUserId, 'quiz', code);

      const targetSocket = io.sockets.sockets.get(player.socketId);
      if (targetSocket) {
        targetSocket.leave(code);
        targetSocket.emit('quiz:kicked', { code });
      }
      io.to(code).emit('quiz:player_left', publicSession(session));
      if (session.hostSocketId) {
        io.to(session.hostSocketId).emit('quiz:host_state', hostState(session));
      }
    });

    // --- XOST: o'yinni tugatish ---
    socket.on('quiz:end', () => {
      const code = socket.data.quizHost;
      const session = sessions.get(code);
      if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Sessiya topilmadi');
      if (session.hostId !== userId) return emitError(socket, 'NOT_HOST', 'Faqat xost');
      if (session.status !== 'playing') return emitError(socket, 'NOT_PLAYING', 'O\'yin davom etmayapti');

      clearTimers(code);
      session.currentIndex = session.questions.length; // oxirgigacha skip
      finishQuiz(io, session);
    });

    // --- XOST: holatni tiklash (refresh bo'lganda) ---
    socket.on('quiz:host_resync', () => {
      const code = socket.data.quizHost || hostSessionMap.get(userId);
      const session = sessions.get(code);
      if (!session) return;
      session.hostSocketId = socket.id;
      session.hostConnected = true;
      socket.join(code);
      socket.emit('quiz:hosted', {
        code,
        quizName: session.quizName,
        questionsCount: session.questions.length,
        players: hostState(session).players,
        status: session.status,
      });
      // Aktiv savol bo'lsa xostga ko'rsatamiz
      if (session.status === 'playing' && session.currentIndex >= 0) {
        const q = session.questions[session.currentIndex];
        socket.emit('quiz:host_question', {
          index: session.currentIndex,
          text: q.text,
          variants: q.variants,
          answer: q.answer,
          image: q.image,
          timeLimit: q.timeLimit,
          points: q.points,
          endsAt: session.questionEndsAt || null,
        });
      }
    });

    // --- O'QUVCHI: qo'shilish / qayta ulanish ---
    socket.on('quiz:join', async (payload) => {
      try {
        if (user.kind !== 'user') return emitError(socket, 'NOT_ALLOWED', 'Faqat o\'quvchi qo\'shila oladi');

        const { code } = payload || {};
        if (!code || typeof code !== 'string') return emitError(socket, 'INVALID_PAYLOAD', 'Kod kerak');

        const session = sessions.get(code.toUpperCase());
        if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Bunday sessiya topilmadi');
        if (session.status === 'finished') return emitError(socket, 'SESSION_ENDED', 'Sessiya tugagan');
        if (userGameMap.has(userId)) {
          const current = userGameMap.get(userId);
          if (current.type === 'quiz' && current.id === session.code) {
            // allaqachon ichidamiz - resync
          } else {
            return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon boshqa o\'yindasiz');
          }
        }

        const dbUser = await fetchFullUser(userId);
        if (!dbUser) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');

        let player = session.players.get(userId);

        if (!player) {
          if (session.players.size >= MAX_PLAYERS) {
            return emitError(socket, 'SESSION_FULL', 'Sessiya to\'la');
          }
          player = buildQuizPlayer(dbUser, socket.id);
          session.players.set(userId, player);
          registerGame(userId, 'quiz', session.code);
        } else {
          // Qayta ulanish - eski socketni almashtiramiz
          player.socketId = socket.id;
          player.connected = true;
          registerGame(userId, 'quiz', session.code);
        }

        userSocketMap.set(userId, socket.id);
        socket.join(session.code);
        session.lastActivity = Date.now();

        // Yangi o'yinchimi yoki qaytganmi
        const isNew = !player.__known;
        player.__known = true;

        socket.emit('quiz:joined', {
          session: publicSession(session),
          player: {
            userId: player.userId,
            full_name: player.full_name,
            avatar: player.avatar,
            currentFrame: player.currentFrame,
            currentEffect: player.currentEffect,
            score: player.score,
            correctCount: player.correctCount,
          },
          // Aktiv savol bo'lsa uni ham yuboramiz (reconnect uchun)
          currentQuestion:
            session.status === 'playing' && session.currentIndex >= 0 && !session.questionEnded
              ? {
                  index: session.currentIndex,
                  totalQuestions: session.questions.length,
                  text: session.questions[session.currentIndex].text,
                  variants: session.questions[session.currentIndex].variants,
                  image: session.questions[session.currentIndex].image || null,
                  timeLimit: session.questions[session.currentIndex].timeLimit,
                  points: session.questions[session.currentIndex].points,
                  endsAt: session.questionEndsAt || Date.now() + 1000,
                }
              : null,
        });

        if (isNew) {
          socket.to(session.code).emit('quiz:player_joined', publicSession(session));
        } else {
          socket.to(session.code).emit('quiz:player_reconnected', publicSession(session));
        }
        if (session.hostSocketId && io.sockets.sockets.get(session.hostSocketId)) {
          io.to(session.hostSocketId).emit('quiz:host_state', hostState(session));
        }
      } catch (err) {
        console.error('quiz:join error:', err);
        emitError(socket, 'JOIN_FAILED', 'Qo\'shilishda xatolik');
      }
    });

    // --- O'QUVCHI: javob berish ---
    socket.on('quiz:answer', (payload) => {
      try {
        const { code, questionIndex, variantIndex } = payload || {};
        const session = sessions.get(String(code || '').toUpperCase());
        if (!session) return emitError(socket, 'SESSION_NOT_FOUND', 'Sessiya topilmadi');
        if (session.status !== 'playing') return emitError(socket, 'NOT_PLAYING', 'Hozir savol yo\'q');
        if (session.currentIndex !== questionIndex) return emitError(socket, 'WRONG_QUESTION', 'Bu savol allaqachon tugagan');
        if (session.questionEnded) return emitError(socket, 'TIME_UP', 'Vaqt tugadi');

        const player = session.players.get(userId);
        if (!player) return emitError(socket, 'NOT_IN_SESSION', 'Siz sessiyada emassiz');
        if (player.answers[questionIndex] !== undefined) {
          return emitError(socket, 'ALREADY_ANSWERED', 'Siz allaqachon javob bergansiz');
        }

        const q = session.questions[questionIndex];
        if (variantIndex < 0 || variantIndex >= q.variants.length) {
          return emitError(socket, 'INVALID_VARIANT', 'Noto\'g\'ri variant');
        }

        player.answers[questionIndex] = variantIndex;

        const now = Date.now();
        const remaining = Math.max(0, (session.questionEndsAt || now) - now);
        const ratio = remaining / ((q.timeLimit || 20) * 1000);

        const isCorrect = q.variants[variantIndex] === q.answer;
        let points = 0;
        if (isCorrect) {
          points = Math.max(1, Math.round(q.points * (0.5 + 0.5 * ratio)));
          player.score += points;
          player.correctCount += 1;
        }

        socket.emit('quiz:answer_result', {
          questionIndex,
          correct: isCorrect,
          points,
          correctIndex: isCorrect ? variantIndex : null,
        });

        // Hozircha to'g'ri javobni ko'rsatmaymiz (revealda ko'rinadi)
        socket.to(session.code).emit('quiz:player_answered', {
          userId,
          answered: true,
          correct: isCorrect,
          score: player.score,
          correctCount: player.correctCount,
        });

        // Xostga holat
        if (session.hostSocketId) {
          io.to(session.hostSocketId).emit('quiz:host_state', hostState(session));
        }
      } catch (err) {
        console.error('quiz:answer error:', err);
        emitError(socket, 'ANSWER_FAILED', 'Javob qayta ishlanmadi');
      }
    });

    // --- O'QUVCHI: sessiyadan chiqish ---
    socket.on('quiz:leave', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'quiz') return;
      const session = sessions.get(entry.id);
      if (!session) {
        userGameMap.delete(userId);
        return;
      }

      session.players.delete(userId);
      unregisterGame(userId, 'quiz', session.code);
      socket.leave(session.code);
      socket.to(session.code).emit('quiz:player_left', publicSession(session));

      if (session.hostSocketId) {
        io.to(session.hostSocketId).emit('quiz:host_state', hostState(session));
      }
    });

    // --- O'QUVCHI: aktiv sessiyani tiklash ---
    socket.on('quiz:get_active', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'quiz') return;
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

      socket.emit('quiz:joined', {
        session: publicSession(session),
        player: {
          userId: player.userId,
          full_name: player.full_name,
          avatar: player.avatar,
          currentFrame: player.currentFrame,
          currentEffect: player.currentEffect,
          score: player.score,
          correctCount: player.correctCount,
        },
        currentQuestion:
          session.status === 'playing' && session.currentIndex >= 0 && !session.questionEnded
            ? {
                index: session.currentIndex,
                totalQuestions: session.questions.length,
                text: session.questions[session.currentIndex].text,
                variants: session.questions[session.currentIndex].variants,
                image: session.questions[session.currentIndex].image || null,
                timeLimit: session.questions[session.currentIndex].timeLimit,
                points: session.questions[session.currentIndex].points,
                endsAt: session.questionEndsAt || Date.now() + 1000,
              }
            : null,
      });
    });

    // --- Uzilish ---
    socket.on('disconnect', () => {
      // Xost uzilsa
      const hostCode = socket.data.quizHost || hostSessionMap.get(userId);
      if (hostCode) {
        const session = sessions.get(hostCode);
        if (session && session.hostSocketId === socket.id) {
          session.hostConnected = false;
        }
      }

      // O'quvchi uzilsa - o'yin davom etadi, reconnect kutiladi
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'quiz') return;
      const session = sessions.get(entry.id);
      if (!session) return;

      const player = session.players.get(userId);
      if (player && player.socketId === socket.id) {
        player.connected = false;
        socket.to(session.code).emit('quiz:player_disconnected', publicSession(session));
      }
    });
  });
}
