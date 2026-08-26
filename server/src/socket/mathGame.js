// MATH GAME - 1v1 matematika o'yini
// Savollar serverda avtomatik generatsiya qilinadi (difficulty bo'yicha)
// Bet (coin) tikiladi, to'g'ri javob tezligi muhim emas - birinchi to'g'ri javob
// 5% komissiya olib qolinadi, qolgani g'olibga ketadi
import { prisma } from '../prisma/client.js';
import {
  emitError,
  fetchFullUser,
  buildPlayerData,
  sanitizePlayer,
  registerGame,
  unregisterGame,
  userSocketMap,
  userGameMap,
  recordGame,
} from './shared.js';

const COMMISSION_RATE = 0.05;
const RECONNECT_TIMEOUT_MS = 30 * 1000;
const INACTIVE_CLEANUP_MS = 10 * 60 * 1000;
const FINISHED_CLEANUP_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const ROUND_ANSWER_TIME_MS = 20 * 1000;
const NEXT_ROUND_DELAY_MS = 3 * 1000;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 25;
const ANSWER_TOLERANCE = 1e-6;

const VALID_DIFFICULTIES = ['easy', 'normal', 'hard', 'very_hard'];
const DIFFICULTY_POINTS = { easy: 1, normal: 2, hard: 3, very_hard: 5 };

const games = new Map();
const disconnectTimers = new Map();
const roundTimers = new Map();
const nextRoundTimers = new Map();

// ============ SAVOL GENERATORLARI ============

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function generateEasyQuestion() {
  const op = pick(['+', '-']);
  const a = randInt(1, 50);
  const b = randInt(1, 50);
  if (op === '+') return { latex: `${a} + ${b}`, answer: a + b };
  return { latex: `${a} - ${b}`, answer: a - b };
}

function generateNormalQuestion() {
  const type = pick(['mul', 'div', 'mixed']);
  if (type === 'mul') {
    const a = randInt(2, 12);
    const b = randInt(2, 12);
    return { latex: `${a} \\times ${b}`, answer: a * b };
  }
  if (type === 'div') {
    const b = randInt(2, 12);
    const q = randInt(2, 20);
    const a = b * q;
    return { latex: `${a} \\div ${b}`, answer: q };
  }
  const a = randInt(2, 12);
  const b = randInt(2, 12);
  const c = randInt(1, 50);
  const sign = pick(['+', '-']);
  if (sign === '+') return { latex: `${a} \\times ${b} + ${c}`, answer: a * b + c };
  return { latex: `${a} \\times ${b} - ${c}`, answer: a * b - c };
}

function generateHardQuestion() {
  const type = pick(['linear', 'exponent', 'sqrt']);
  if (type === 'linear') {
    const a = randInt(2, 9);
    const x = randInt(-15, 15);
    const b = randInt(-20, 20);
    const c = a * x + b;
    const bTerm = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
    return { latex: `${a}x ${bTerm} = ${c}`, answer: x, prompt: 'x ni toping' };
  }
  if (type === 'exponent') {
    const a = randInt(2, 15);
    const b = randInt(1, 50);
    return { latex: `${a}^2 + ${b}`, answer: a * a + b };
  }
  const x = randInt(2, 20);
  const a = x * x;
  const b = randInt(1, 30);
  return { latex: `\\sqrt{${a}} + ${b}`, answer: x + b };
}

function generateVeryHardQuestion() {
  const type = pick(['square_diff', 'two_step_linear', 'fraction']);
  if (type === 'square_diff') {
    const a = randInt(2, 15);
    const b = randInt(2, 15);
    const c = randInt(2, 12);
    const d = randInt(2, 12);
    const answer = (a + b) * (a + b) - c * d;
    return { latex: `(${a} + ${b})^2 - ${c} \\times ${d}`, answer };
  }
  if (type === 'two_step_linear') {
    const a = randInt(2, 9);
    const b = randInt(-15, 15);
    const x = randInt(-12, 12);
    const c = a * (x + b);
    const bTerm = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
    return { latex: `${a}(x ${bTerm}) = ${c}`, answer: x, prompt: 'x ni toping' };
  }
  const b = randInt(2, 12);
  const m = randInt(2, 12);
  const c = randInt(2, 12);
  const a = b * m;
  const d = randInt(1, 40);
  return { latex: `\\frac{${a} \\times ${c}}{${b}} + ${d}`, answer: m * c + d };
}

function generateQuestion(difficulty) {
  switch (difficulty) {
    case 'easy': return generateEasyQuestion();
    case 'normal': return generateNormalQuestion();
    case 'hard': return generateHardQuestion();
    case 'very_hard': return generateVeryHardQuestion();
    default: return generateEasyQuestion();
  }
}

function getRequiredWins(rounds) {
  return Math.floor(rounds / 2) + 1;
}

// ============ GAME STATE ============

function getRole(game, userId) {
  if (game.host && game.host.id === userId) return 'host';
  if (game.guest && game.guest.id === userId) return 'guest';
  return null;
}

function sanitizeGame(game) {
  let remainingMs = 0;
  if (game.currentQuestion && game.roundStartedAt && game.status === 'active') {
    const elapsed = Date.now() - game.roundStartedAt;
    remainingMs = Math.max(0, ROUND_ANSWER_TIME_MS - elapsed);
  } else if (game.currentQuestion && !game.roundStartedAt) {
    remainingMs = ROUND_ANSWER_TIME_MS;
  }

  return {
    gameId: game.gameId,
    host: sanitizePlayer(game.host),
    guest: sanitizePlayer(game.guest),
    status: game.status,
    public: game.public,
    bet: game.bet,
    difficulty: game.difficulty,
    rounds: game.rounds,
    currentRound: game.currentRound,
    score: game.score,
    winner: game.winner,
    hostBet: game.hostBet,
    guestBet: game.guestBet,
    createdAt: game.createdAt,
    currentQuestion: game.currentQuestion
      ? {
          round: game.currentRound,
          latex: game.currentQuestion.latex,
          prompt: game.currentQuestion.prompt || null,
          remainingMs,
        }
      : null,
    timeLeftMs: remainingMs,
    rematchRequests: game.rematchRequests || {},
  };
}

function clearDisconnectTimer(gameId, role) {
  const timers = disconnectTimers.get(gameId);
  if (timers && timers[role]) {
    clearTimeout(timers[role]);
    delete timers[role];
  }
}

function clearRoundTimer(gameId) {
  if (roundTimers.has(gameId)) {
    clearTimeout(roundTimers.get(gameId));
    roundTimers.delete(gameId);
  }
}

function clearNextRoundTimer(gameId) {
  if (nextRoundTimers.has(gameId)) {
    clearTimeout(nextRoundTimers.get(gameId));
    nextRoundTimers.delete(gameId);
  }
}

function clearUserMaps(game) {
  if (game.host && userGameMap.get(game.host.id)?.id === game.gameId) userGameMap.delete(game.host.id);
  if (game.guest && userGameMap.get(game.guest.id)?.id === game.gameId) userGameMap.delete(game.guest.id);
}

async function cleanupGame(gameId) {
  const game = games.get(gameId);

  const timers = disconnectTimers.get(gameId);
  if (timers) {
    if (timers.host) clearTimeout(timers.host);
    if (timers.guest) clearTimeout(timers.guest);
    disconnectTimers.delete(gameId);
  }
  clearRoundTimer(gameId);
  clearNextRoundTimer(gameId);

  if (game) {
    // Aktiv o'yin bekor bo'lsa - betlarni qaytarish
    if (game.status === 'active' && game.hostBet > 0) {
      try {
        await prisma.$transaction([
          prisma.user.update({ where: { id: game.host.id }, data: { coin: { increment: game.hostBet } } }),
          prisma.user.update({ where: { id: game.guest.id }, data: { coin: { increment: game.guestBet } } }),
        ]);
      } catch (err) {
        console.error(`[mathgame:${gameId}] bet qaytarishda xato:`, err);
      }
    }
    clearUserMaps(game);
  }
  games.delete(gameId);
}

// ============ O'YIN JARAYONI ============

async function finishGame(io, game, winnerRole) {
  try {
    clearRoundTimer(game.gameId);
    clearNextRoundTimer(game.gameId);

    game.status = 'finished';
    game.winner = winnerRole;
    game.finishedAt = Date.now();
    game.lastActivity = Date.now();
    game.currentQuestion = null;

    clearUserMaps(game);

    // Durrang - betlar qaytariladi
    if (!winnerRole) {
      if (game.hostBet > 0) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: game.host.id }, data: { coin: { increment: game.hostBet } } }),
          prisma.user.update({ where: { id: game.guest.id }, data: { coin: { increment: game.guestBet } } }),
        ]);
      }
      io.to(game.gameId).emit('mathgame:end', {
        winner: null,
        draw: true,
        score: game.score,
        payout: 0,
        commission: 0,
        earnedPoints: 0,
        game: sanitizeGame(game),
      });
      return;
    }

    const winnerId = winnerRole === 'host' ? game.host.id : game.guest.id;
    const totalPot = (game.hostBet || 0) + (game.guestBet || 0);
    let payout = 0;
    let commission = 0;

    if (totalPot > 0) {
      commission = Math.floor(totalPot * COMMISSION_RATE);
      payout = totalPot - commission;
    }

    const earnedPoints = game.score[winnerRole] * DIFFICULTY_POINTS[game.difficulty];

    await prisma.$transaction(async (tx) => {
      const data = {
        score: { increment: earnedPoints },
        week_score: { increment: earnedPoints },
        month_score: { increment: earnedPoints },
      };
      if (payout > 0) data.coin = { increment: payout };
      await tx.user.update({ where: { id: winnerId }, data });
    });

    await recordGame({
      type: 'math',
      roomCode: game.gameId,
      winnerId,
      winnerName: winnerRole === 'host' ? game.host.full_name : game.guest.full_name,
      totalPlayers: 2,
      totalBets: totalPot,
      commission,
      payload: { difficulty: game.difficulty, rounds: game.rounds, score: game.score },
    });

    io.to(game.gameId).emit('mathgame:end', {
      winner: winnerRole,
      score: game.score,
      payout,
      commission,
      earnedPoints,
      game: sanitizeGame(game),
    });
  } catch (err) {
    console.error(`[mathgame:${game.gameId}] natijani saqlashda xato:`, err);
    io.to(game.gameId).emit('error', {
      code: 'FINALIZE_FAILED',
      message: 'O\'yin natijasini saqlashda xatolik. Support bilan bog\'laning',
    });
  }
}

function startRound(io, game) {
  clearRoundTimer(game.gameId);
  clearNextRoundTimer(game.gameId);

  const question = generateQuestion(game.difficulty);
  game.currentQuestion = question;
  game.roundAnsweredBy = null;
  game.roundStartedAt = Date.now();
  game.lastActivity = Date.now();

  io.to(game.gameId).emit('round:start', {
    round: game.currentRound,
    totalRounds: game.rounds,
    difficulty: game.difficulty,
    latex: question.latex,
    prompt: question.prompt || null,
    timeLimitMs: ROUND_ANSWER_TIME_MS,
    score: game.score,
  });

  roundTimers.set(
    game.gameId,
    setTimeout(() => handleRoundTimeout(io, game.gameId), ROUND_ANSWER_TIME_MS)
  );
}

function advanceOrFinish(io, game) {
  game.currentRound += 1;

  if (game.currentRound > game.rounds) {
    if (game.score.host === game.score.guest) {
      finishGame(io, game, null);
      return;
    }
    const winnerRole = game.score.host > game.score.guest ? 'host' : 'guest';
    finishGame(io, game, winnerRole);
    return;
  }

  nextRoundTimers.set(
    game.gameId,
    setTimeout(() => {
      const current = games.get(game.gameId);
      if (!current || current.status !== 'active') return;
      startRound(io, current);
    }, NEXT_ROUND_DELAY_MS)
  );
}

function handleRoundTimeout(io, gameId) {
  const game = games.get(gameId);
  if (!game || game.status !== 'active') return;
  if (game.roundAnsweredBy) return;

  io.to(gameId).emit('round:end', {
    round: game.currentRound,
    timeout: true,
    correctAnswer: game.currentQuestion.answer,
    latex: game.currentQuestion.latex,
    score: game.score,
    currentRound: game.currentRound,
  });

  game.currentQuestion = null;
  advanceOrFinish(io, game);
}

// ============ SOCKET HANDLERS ============

function handleDisconnect(io, socket) {
  const userId = socket.data.user && socket.data.user.id;
  if (!userId) return;

  if (userSocketMap.get(userId) !== socket.id) return;

  const entry = userGameMap.get(userId);
  if (!entry || entry.type !== 'math') return;

  const game = games.get(entry.id);
  if (!game) return;

  const role = getRole(game, userId);
  if (!role) return;

  game[role].connected = false;
  game.lastActivity = Date.now();

  if (game.status !== 'active') return;

  io.to(game.gameId).emit('player:left', { role, userId, temporary: true });

  if (!disconnectTimers.has(game.gameId)) disconnectTimers.set(game.gameId, {});
  const timers = disconnectTimers.get(game.gameId);

  timers[role] = setTimeout(async () => {
    const currentGame = games.get(game.gameId);
    if (!currentGame || currentGame.status !== 'active') return;

    const stillDisconnected = currentGame[role] && !currentGame[role].connected;
    if (!stillDisconnected) return;

    const opponentRole = role === 'host' ? 'guest' : 'host';
    if (currentGame[opponentRole]) {
      await finishGame(io, currentGame, opponentRole);
    } else {
      cleanupGame(game.gameId);
    }
  }, RECONNECT_TIMEOUT_MS);
}

// Lobi uchun: ochiq kutish xonalari
export function getMathLobbyRooms() {
  const rooms = [];
  for (const game of games.values()) {
    if (game.status === 'waiting' && game.public) {
      rooms.push({
        gameId: game.gameId,
        type: 'math',
        host: {
          id: game.host.id,
          full_name: game.host.full_name,
          avatar: game.host.avatar,
          currentFrame: game.host.currentFrame,
          currentEffect: game.host.currentEffect,
        },
        bet: game.bet,
        difficulty: game.difficulty,
        rounds: game.rounds,
        createdAt: game.createdAt,
      });
    }
  }
  return rooms;
}

export function setupMathGame(io) {
  // Tozalash soati - har daqiqada ishlaydi
  setInterval(() => {
    const now = Date.now();
    for (const [gameId, game] of games) {
      if (!game) continue;
      if (game.status === 'finished' || game.status === 'cancelled') {
        const referenceTime = game.finishedAt || game.lastActivity || game.createdAt;
        if (now - referenceTime > FINISHED_CLEANUP_MS) cleanupGame(gameId);
      } else {
        const referenceTime = game.lastActivity || game.createdAt;
        if (now - referenceTime > INACTIVE_CLEANUP_MS) cleanupGame(gameId);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;

    // Faqat o'quvchilar o'ynay oladi
    const isStudent = socket.data.user.kind === 'user';
    if (!isStudent) return;

    // --- Aktiv o'yinni tiklash (refresh bo'lganda) ---
    socket.on('mathgame:get_active', async () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'math') return;

      const game = games.get(entry.id);
      if (!game) return;

      if (game.status !== 'finished' && game.status !== 'cancelled') {
        const role = getRole(game, userId);
        if (role) {
          game[role].connected = true;
          game[role].socketId = socket.id;
          userSocketMap.set(userId, socket.id);
          socket.join(game.gameId);
          clearDisconnectTimer(game.gameId, role);

          socket.emit('mathgame:active', { game: sanitizeGame(game) });
          socket.to(game.gameId).emit('game:update', { game: sanitizeGame(game) });
        }
      } else {
        userGameMap.delete(userId);
      }
    });

    // --- O'yin yaratish ---
    socket.on('mathgame:create', async (payload) => {
      try {
        const { rounds, bet, difficulty, isPublic } = payload || {};

        if (!Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
          return emitError(socket, 'INVALID_ROUNDS', `Rounds ${MIN_ROUNDS}-${MAX_ROUNDS} oralig'ida bo'lishi kerak`);
        }
        if (!VALID_DIFFICULTIES.includes(difficulty)) {
          return emitError(socket, 'INVALID_DIFFICULTY', `Difficulty: ${VALID_DIFFICULTIES.join(', ')}`);
        }
        if (typeof bet !== 'number' || !Number.isFinite(bet) || bet < 0 || !Number.isInteger(bet)) {
          return emitError(socket, 'INVALID_BET', 'Bet musbat butun son bo\'lishi kerak');
        }
        if (userGameMap.has(userId)) {
          return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon aktiv o\'yindasiz');
        }

        const user = await fetchFullUser(userId);
        if (!user) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');
        if (bet > 0 && user.coin < bet) {
          return emitError(socket, 'INSUFFICIENT_COINS', 'Bu tikish uchun yetarli coin yo\'q');
        }

        let gameId;
        do {
          gameId = String(Math.floor(100000 + Math.random() * 900000));
        } while (games.has(gameId));

        games.set(gameId, {
          gameId,
          host: buildPlayerData(user, socket.id),
          guest: null,
          status: 'waiting',
          public: !!isPublic,
          bet,
          difficulty,
          rounds,
          currentRound: 1,
          score: { host: 0, guest: 0 },
          winner: null,
          hostBet: bet,
          guestBet: 0,
          rematchRequests: {},
          currentQuestion: null,
          roundAnsweredBy: null,
          roundStartedAt: null,
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });

        registerGame(userId, 'math', gameId);
        userSocketMap.set(userId, socket.id);
        socket.join(gameId);

        socket.emit('mathgame:created', { game: sanitizeGame(games.get(gameId)) });
      } catch (err) {
        console.error('mathgame:create error:', err);
        emitError(socket, 'CREATE_FAILED', 'O\'yin yaratishda xatolik');
      }
    });

    // --- O'yinga qo'shilish (kod orqali) ---
    socket.on('mathgame:join', async (payload) => {
      try {
        const { gameId } = payload || {};
        if (!gameId || typeof gameId !== 'string') {
          return emitError(socket, 'INVALID_PAYLOAD', 'gameId kerak');
        }

        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status === 'finished' || game.status === 'cancelled') {
          return emitError(socket, 'GAME_FINISHED', 'Bu o\'yin tugagan');
        }
        if (game.status !== 'waiting') {
          return emitError(socket, 'GAME_NOT_JOINABLE', 'Bu o\'yinga hozir qo\'shilib bo\'lmaydi');
        }
        if (game.guest) return emitError(socket, 'GAME_FULL', 'O\'yin to\'la');
        if (game.host.id === userId) return emitError(socket, 'CANNOT_JOIN_OWN_GAME', 'O\'z o\'yiningizga qo\'shila olmaysiz');
        if (userGameMap.has(userId)) return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon aktiv o\'yindasiz');

        const user = await fetchFullUser(userId);
        if (!user) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');

        if (game.hostBet > 0) {
          if (user.coin < game.hostBet) {
            return emitError(socket, 'INSUFFICIENT_COINS', 'Qo\'shilish uchun yetarli coin yo\'q');
          }
          const hostUser = await fetchFullUser(game.host.id);
          if (!hostUser || hostUser.coin < game.hostBet) {
            cleanupGame(gameId);
            return emitError(socket, 'HOST_INSUFFICIENT_COINS', 'Xostda yetarli coin qolmagan. O\'yin bekor qilindi');
          }

          await prisma.$transaction([
            prisma.user.update({ where: { id: game.host.id }, data: { coin: { decrement: game.hostBet } } }),
            prisma.user.update({ where: { id: userId }, data: { coin: { decrement: game.hostBet } } }),
          ]);
        }

        game.guest = buildPlayerData(user, socket.id);
        game.guestBet = game.hostBet;
        game.status = 'active';
        game.lastActivity = Date.now();

        registerGame(userId, 'math', gameId);
        userSocketMap.set(userId, socket.id);
        socket.join(gameId);

        io.to(gameId).emit('mathgame:joined', { game: sanitizeGame(game) });
        io.to(gameId).emit('mathgame:start', { game: sanitizeGame(game) });

        startRound(io, game);
      } catch (err) {
        console.error('mathgame:join error:', err);
        emitError(socket, 'JOIN_FAILED', 'Qo\'shilishda xatolik');
      }
    });

    // --- Javob yuborish ---
    socket.on('mathgame:answer', (payload) => {
      try {
        const { gameId, answer } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'active' || !game.currentQuestion) {
          return emitError(socket, 'GAME_NOT_ACTIVE', 'Hozir aktiv savol yo\'q');
        }

        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');
        if (game.roundAnsweredBy) return emitError(socket, 'ROUND_ALREADY_ANSWERED', 'Bu raund allaqachon javoblangan');

        const parsed = typeof answer === 'number' ? answer : parseFloat(answer);
        if (!Number.isFinite(parsed)) return emitError(socket, 'INVALID_ANSWER', 'Javob son bo\'lishi kerak');

        const isCorrect = Math.abs(parsed - game.currentQuestion.answer) < ANSWER_TOLERANCE;

        if (!isCorrect) {
          socket.to(gameId).emit('answer:attempt', { role, correct: false });
          socket.emit('answer:attempt', { role, correct: false, yourAnswer: parsed });
          return;
        }

        clearRoundTimer(gameId);
        game.roundAnsweredBy = role;
        game.score[role] += 1;
        game.lastActivity = Date.now();

        const requiredWins = getRequiredWins(game.rounds);
        const correctAnswer = game.currentQuestion.answer;
        const latex = game.currentQuestion.latex;
        game.currentQuestion = null;

        io.to(gameId).emit('round:end', {
          round: game.currentRound,
          winner: role,
          correctAnswer,
          latex,
          yourAnswer: parsed,
          score: game.score,
          currentRound: game.currentRound,
        });

        if (game.score[role] >= requiredWins) {
          finishGame(io, game, role);
          return;
        }

        advanceOrFinish(io, game);
      } catch (err) {
        console.error('mathgame:answer error:', err);
        emitError(socket, 'ANSWER_FAILED', 'Javobni qayta ishlashda xatolik');
      }
    });

    // --- O'yinni tark etish ---
    socket.on('mathgame:leave', async (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');

        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');

        socket.leave(gameId);
        clearDisconnectTimer(gameId, role);

        if (game.status === 'active') {
          const opponentRole = role === 'host' ? 'guest' : 'host';
          io.to(gameId).emit('player:left', { role, userId, temporary: false });
          if (game[opponentRole]) {
            await finishGame(io, game, opponentRole);
          } else {
            cleanupGame(gameId);
          }
        } else if (game.status === 'waiting') {
          io.to(gameId).emit('player:left', { role, userId, temporary: false });
          cleanupGame(gameId);
        } else {
          io.to(gameId).emit('player:left', { role, userId, temporary: false });
        }
      } catch (err) {
        console.error('mathgame:leave error:', err);
        emitError(socket, 'LEAVE_FAILED', 'Chiqishda xatolik');
      }
    });

    // --- Revansh (rematch) ---
    socket.on('mathgame:rematch', async (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'finished') return emitError(socket, 'GAME_NOT_FINISHED', 'Faqat tugagan o\'yin uchun revansh mumkin');

        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');

        game.rematchRequests = game.rematchRequests || {};
        game.rematchRequests[role] = true;
        game.lastActivity = Date.now();

        const opponentRole = role === 'host' ? 'guest' : 'host';
        if (!game.rematchRequests[opponentRole]) {
          socket.to(gameId).emit('mathgame:rematch', { requestedBy: role });
          return;
        }

        const [hostUser, guestUser] = await Promise.all([fetchFullUser(game.host.id), fetchFullUser(game.guest.id)]);

        if (game.hostBet > 0 && (!hostUser || !guestUser || hostUser.coin < game.hostBet || guestUser.coin < game.guestBet)) {
          game.rematchRequests = {};
          io.to(gameId).emit('error', {
            code: 'INSUFFICIENT_COINS',
            message: 'O\'yinchilardan birida revansh uchun yetarli coin yo\'q',
          });
          return;
        }

        if (game.hostBet > 0) {
          await prisma.$transaction([
            prisma.user.update({ where: { id: game.host.id }, data: { coin: { decrement: game.hostBet } } }),
            prisma.user.update({ where: { id: game.guest.id }, data: { coin: { decrement: game.guestBet } } }),
          ]);
        }

        if (hostUser) {
          game.host.coin = hostUser.coin - game.hostBet;
          game.host.avatar = hostUser.avatar;
          game.host.currentFrame = hostUser.currentFrame || null;
          game.host.currentEffect = hostUser.currentEffect || null;
          game.host.score = hostUser.score;
          game.host.week_score = hostUser.week_score;
          game.host.month_score = hostUser.month_score;
        }
        if (guestUser) {
          game.guest.coin = guestUser.coin - game.guestBet;
          game.guest.avatar = guestUser.avatar;
          game.guest.currentFrame = guestUser.currentFrame || null;
          game.guest.currentEffect = guestUser.currentEffect || null;
          game.guest.score = guestUser.score;
          game.guest.week_score = guestUser.week_score;
          game.guest.month_score = guestUser.month_score;
        }

        registerGame(game.host.id, 'math', gameId);
        registerGame(game.guest.id, 'math', gameId);

        game.winner = null;
        game.status = 'active';
        game.currentRound = 1;
        game.score = { host: 0, guest: 0 };
        game.rematchRequests = {};
        game.finishedAt = null;
        game.currentQuestion = null;
        game.roundAnsweredBy = null;
        game.roundStartedAt = null;
        game.lastActivity = Date.now();

        io.to(gameId).emit('mathgame:start', { game: sanitizeGame(game) });
        startRound(io, game);
      } catch (err) {
        console.error('mathgame:rematch error:', err);
        emitError(socket, 'REMATCH_FAILED', 'Revansh so\'rovida xatolik');
      }
    });

    // --- Xost o'yinni bekor qiladi (kutish xonasida) ---
    socket.on('mathgame:cancel', (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');

        const role = getRole(game, userId);
        if (role !== 'host') return emitError(socket, 'NOT_HOST', 'Faqat xost bekor qila oladi');
        if (game.status !== 'waiting') {
          return emitError(socket, 'CANNOT_CANCEL', 'Faqat kutish xonasidagi o\'yin bekor qilinadi');
        }

        game.status = 'cancelled';
        socket.leave(gameId);
        cleanupGame(gameId);
        socket.emit('mathgame:cancelled', { gameId });
      } catch (err) {
        console.error('mathgame:cancel error:', err);
        emitError(socket, 'CANCEL_FAILED', 'Bekor qilishda xatolik');
      }
    });

    // --- Uzilish ---
    socket.on('disconnect', () => handleDisconnect(io, socket));
  });
}
