// TIC-TAC-TOE - 1v1 klassik o'yin, bet (coin) bilan
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
const WINNER_SCORE_POINTS = 15; // g'olibga leaderboard balli

const games = new Map();
const disconnectTimers = new Map();

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function getRole(game, userId) {
  if (game.host && game.host.id === userId) return 'host';
  if (game.guest && game.guest.id === userId) return 'guest';
  return null;
}

function sanitizeGame(game) {
  return {
    gameId: game.gameId,
    host: sanitizePlayer(game.host),
    guest: sanitizePlayer(game.guest),
    status: game.status,
    public: game.public,
    bet: game.bet,
    rounds: game.rounds,
    roundScore: game.roundScore,
    currentRound: game.currentRound,
    lastRoundWinner: game.lastRoundWinner,
    board: game.board,
    turn: game.turn,
    moveCount: game.moveCount,
    winner: game.winner,
    winningLine: game.winningLine,
    score: game.score,
    hostBet: game.hostBet,
    guestBet: game.guestBet,
    rematchRequests: game.rematchRequests || {},
    createdAt: game.createdAt,
  };
}

function checkWin(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

// Round tugashi: keyingi round yoki o'yin yakuni
async function handleRoundEnd(io, game, roundWinner) {
  const required = Math.floor(game.rounds / 2) + 1;

  // O'yin yakuni: kimdir yetarli round yutdi yoki barcha roundlar tugadi
  if (game.roundScore.host >= required || game.roundScore.guest >= required || game.currentRound >= game.rounds) {
    let winnerRole = null;
    if (game.roundScore.host !== game.roundScore.guest) {
      winnerRole = game.roundScore.host > game.roundScore.guest ? 'host' : 'guest';
    }
    // Yakuniy natija (score maydoni umumiy round hisobi bilan)
    io.to(game.gameId).emit('ttt:round_end', {
      round: game.currentRound,
      roundWinner,
      roundScore: game.roundScore,
      final: true,
    });
    await finishGame(io, game, winnerRole);
    return;
  }

  // Keyingi round
  game.currentRound += 1;
  game.board = Array(9).fill(null);
  game.moveCount = 0;
  game.winner = null;
  game.winningLine = null;
  // Navbat: round g'olibiga (yoki durrangda host ga)
  game.turn = roundWinner || 'host';
  game.lastActivity = Date.now();

  io.to(game.gameId).emit('ttt:round_end', {
    round: game.currentRound - 1,
    roundWinner,
    roundScore: game.roundScore,
    final: false,
  });
  emitState(io, game);
}

function clearDisconnectTimer(gameId, role) {
  const timers = disconnectTimers.get(gameId);
  if (timers && timers[role]) {
    clearTimeout(timers[role]);
    delete timers[role];
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
  if (game) {
    if (game.status === 'active' && game.bet > 0) {
      try {
        await prisma.$transaction([
          prisma.user.update({ where: { id: game.host.id }, data: { coin: { increment: game.hostBet } } }),
          prisma.user.update({ where: { id: game.guest.id }, data: { coin: { increment: game.guestBet } } }),
        ]);
      } catch (err) {
        console.error(`[ttt:${gameId}] bet qaytarishda xato:`, err);
      }
    }
    clearUserMaps(game);
  }
  games.delete(gameId);
}

async function finishGame(io, game, winnerRole) {
  try {
    game.status = 'finished';
    game.winner = winnerRole;
    game.finishedAt = Date.now();
    game.lastActivity = Date.now();
    game.score = { ...game.roundScore }; // umumiy round hisobi
    clearUserMaps(game);

    // Durrang - bet qaytariladi
    if (!winnerRole) {
      if (game.bet > 0) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: game.host.id }, data: { coin: { increment: game.hostBet } } }),
          prisma.user.update({ where: { id: game.guest.id }, data: { coin: { increment: game.guestBet } } }),
        ]);
      }
      io.to(game.gameId).emit('ttt:end', {
        winner: null,
        draw: true,
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

    await prisma.$transaction(async (tx) => {
      const data = {
        score: { increment: WINNER_SCORE_POINTS },
        week_score: { increment: WINNER_SCORE_POINTS },
        month_score: { increment: WINNER_SCORE_POINTS },
      };
      if (payout > 0) data.coin = { increment: payout };
      await tx.user.update({ where: { id: winnerId }, data });
    });

    await recordGame({
      type: 'tictactoe',
      roomCode: game.gameId,
      winnerId,
      winnerName: winnerRole === 'host' ? game.host.full_name : game.guest.full_name,
      totalPlayers: 2,
      totalBets: totalPot,
      commission,
      payload: { moves: game.moveCount },
    });

    io.to(game.gameId).emit('ttt:end', {
      winner: winnerRole,
      payout,
      commission,
      earnedPoints: WINNER_SCORE_POINTS,
      game: sanitizeGame(game),
    });
  } catch (err) {
    console.error(`[ttt:${game.gameId}] natijani saqlashda xato:`, err);
    io.to(game.gameId).emit('error', { code: 'FINALIZE_FAILED', message: 'O\'yin natijasini saqlashda xatolik' });
  }
}

function emitState(io, game) {
  io.to(game.gameId).emit('ttt:state', sanitizeGame(game));
}

function handleDisconnect(io, socket) {
  const userId = socket.data.user && socket.data.user.id;
  if (!userId) return;
  if (userSocketMap.get(userId) !== socket.id) return;

  const entry = userGameMap.get(userId);
  if (!entry || entry.type !== 'ttt') return;

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
    if (currentGame[role] && currentGame[role].connected) return;

    const opponentRole = role === 'host' ? 'guest' : 'host';
    if (currentGame[opponentRole]) {
      await finishGame(io, currentGame, opponentRole);
    } else {
      cleanupGame(game.gameId);
    }
  }, RECONNECT_TIMEOUT_MS);
}

// Lobi uchun: ochiq kutish xonalari
export function getTicTacToeLobbyRooms() {
  const rooms = [];
  for (const game of games.values()) {
    if (game.status === 'waiting' && game.public) {
      rooms.push({
        gameId: game.gameId,
        type: 'tictactoe',
        host: {
          id: game.host.id,
          full_name: game.host.full_name,
          avatar: game.host.avatar,
          currentFrame: game.host.currentFrame,
          currentEffect: game.host.currentEffect,
        },
        bet: game.bet,
        rounds: game.rounds,
        createdAt: game.createdAt,
      });
    }
  }
  return rooms;
}

export function setupTicTacToe(io) {
  setInterval(() => {
    const now = Date.now();
    for (const [gameId, game] of games) {
      if (!game) continue;
      if (game.status === 'finished' || game.status === 'cancelled') {
        const ref = game.finishedAt || game.lastActivity || game.createdAt;
        if (now - ref > FINISHED_CLEANUP_MS) cleanupGame(gameId);
      } else {
        const ref = game.lastActivity || game.createdAt;
        if (now - ref > INACTIVE_CLEANUP_MS) cleanupGame(gameId);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    if (socket.data.user.kind !== 'user') return;

    // Aktiv o'yinni tiklash
    socket.on('ttt:get_active', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'ttt') return;
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
          socket.emit('ttt:active', { game: sanitizeGame(game) });
          socket.to(game.gameId).emit('game:update', { game: sanitizeGame(game) });
        }
      } else {
        userGameMap.delete(userId);
      }
    });

    // Yaratish (rounds: 1-9, har round alohida board)
    socket.on('ttt:create', async (payload) => {
      try {
        const { bet, rounds, isPublic } = payload || {};
        if (typeof bet !== 'number' || !Number.isInteger(bet) || bet < 0) {
          return emitError(socket, 'INVALID_BET', 'Bet musbat butun son bo\'lishi kerak');
        }
        const r = Number.isInteger(rounds) ? rounds : 1;
        if (r < 1 || r > 9) return emitError(socket, 'INVALID_ROUNDS', 'Rounds 1-9 oralig\'ida bo\'lishi kerak');
        if (userGameMap.has(userId)) return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon aktiv o\'yindasiz');

        const user = await fetchFullUser(userId);
        if (!user) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');
        if (bet > 0 && user.coin < bet) return emitError(socket, 'INSUFFICIENT_COINS', 'Yetarli coin yo\'q');

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
          rounds: r,
          roundScore: { host: 0, guest: 0 },
          currentRound: 1,
          lastRoundWinner: null,
          board: Array(9).fill(null),
          turn: 'host',
          moveCount: 0,
          winner: null,
          winningLine: null,
          score: { host: 0, guest: 0 },
          hostBet: bet,
          guestBet: 0,
          rematchRequests: {},
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });

        registerGame(userId, 'ttt', gameId);
        userSocketMap.set(userId, socket.id);
        socket.join(gameId);

        socket.emit('ttt:created', { game: sanitizeGame(games.get(gameId)) });
      } catch (err) {
        console.error('ttt:create error:', err);
        emitError(socket, 'CREATE_FAILED', 'O\'yin yaratishda xatolik');
      }
    });

    // Qo'shilish
    socket.on('ttt:join', async (payload) => {
      try {
        const { gameId } = payload || {};
        if (!gameId || typeof gameId !== 'string') return emitError(socket, 'INVALID_PAYLOAD', 'gameId kerak');

        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'waiting') return emitError(socket, 'GAME_NOT_JOINABLE', 'Bu o\'yinga qo\'shilib bo\'lmaydi');
        if (game.guest) return emitError(socket, 'GAME_FULL', 'O\'yin to\'la');
        if (game.host.id === userId) return emitError(socket, 'CANNOT_JOIN_OWN_GAME', 'O\'z o\'yiningizga qo\'shila olmaysiz');
        if (userGameMap.has(userId)) return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon aktiv o\'yindasiz');

        const user = await fetchFullUser(userId);
        if (!user) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');

        if (game.bet > 0) {
          if (user.coin < game.bet) return emitError(socket, 'INSUFFICIENT_COINS', 'Qo\'shilish uchun yetarli coin yo\'q');
          const hostUser = await fetchFullUser(game.host.id);
          if (!hostUser || hostUser.coin < game.bet) {
            cleanupGame(gameId);
            return emitError(socket, 'HOST_INSUFFICIENT_COINS', 'Xostda yetarli coin qolmagan. O\'yin bekor qilindi');
          }
          await prisma.$transaction([
            prisma.user.update({ where: { id: game.host.id }, data: { coin: { decrement: game.bet } } }),
            prisma.user.update({ where: { id: userId }, data: { coin: { decrement: game.bet } } }),
          ]);
        }

        game.guest = buildPlayerData(user, socket.id);
        game.guestBet = game.bet;
        game.status = 'active';
        game.turn = 'host';
        game.lastActivity = Date.now();

        registerGame(userId, 'ttt', gameId);
        userSocketMap.set(userId, socket.id);
        socket.join(gameId);

        io.to(gameId).emit('ttt:joined', { game: sanitizeGame(game) });
        io.to(gameId).emit('ttt:start', { game: sanitizeGame(game) });
        emitState(io, game);
      } catch (err) {
        console.error('ttt:join error:', err);
        emitError(socket, 'JOIN_FAILED', 'Qo\'shilishda xatolik');
      }
    });

    // Yurish
    socket.on('ttt:move', async (payload) => {
      try {
        const { gameId, cell } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'active') return emitError(socket, 'GAME_NOT_ACTIVE', 'O\'yin aktiv emas');

        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');
        if (game.turn !== role) return emitError(socket, 'NOT_YOUR_TURN', 'Hozir sizning navbatingiz emas');
        if (!Number.isInteger(cell) || cell < 0 || cell > 8) return emitError(socket, 'INVALID_CELL', 'Noto\'g\'ri katak');
        if (game.board[cell] !== null) return emitError(socket, 'CELL_TAKEN', 'Bu katak band');

        game.board[cell] = role === 'host' ? 'X' : 'O';
        game.moveCount += 1;
        game.lastActivity = Date.now();

        const result = checkWin(game.board);

        if (result) {
          const roundWinner = result.winner === 'X' ? 'host' : 'guest';
          game.winner = roundWinner;
          game.winningLine = result.line;
          game.lastRoundWinner = roundWinner;
          game.roundScore[roundWinner] += 1;
          emitState(io, game);
          await handleRoundEnd(io, game, roundWinner);
          return;
        }

        if (game.moveCount >= 9) {
          // Durrang round
          game.lastRoundWinner = null;
          emitState(io, game);
          await handleRoundEnd(io, game, null);
          return;
        }

        game.turn = game.turn === 'host' ? 'guest' : 'host';
        emitState(io, game);
      } catch (err) {
        console.error('ttt:move error:', err);
        emitError(socket, 'MOVE_FAILED', 'Yurish qayta ishlanmadi');
      }
    });

    // Chiqish
    socket.on('ttt:leave', async (payload) => {
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
        console.error('ttt:leave error:', err);
        emitError(socket, 'LEAVE_FAILED', 'Chiqishda xatolik');
      }
    });

    // Revansh
    socket.on('ttt:rematch', async (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'finished') return emitError(socket, 'GAME_NOT_FINISHED', 'Faqat tugagan o\'yin uchun');

        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');

        game.rematchRequests = game.rematchRequests || {};
        game.rematchRequests[role] = true;
        game.lastActivity = Date.now();

        const opponentRole = role === 'host' ? 'guest' : 'host';
        if (!game.rematchRequests[opponentRole]) {
          socket.to(gameId).emit('ttt:rematch', { requestedBy: role });
          return;
        }

        const [hostUser, guestUser] = await Promise.all([fetchFullUser(game.host.id), fetchFullUser(game.guest.id)]);
        if (game.bet > 0 && (!hostUser || !guestUser || hostUser.coin < game.bet || guestUser.coin < game.bet)) {
          game.rematchRequests = {};
          io.to(gameId).emit('error', { code: 'INSUFFICIENT_COINS', message: 'Revansh uchun yetarli coin yo\'q' });
          return;
        }

        if (game.bet > 0) {
          await prisma.$transaction([
            prisma.user.update({ where: { id: game.host.id }, data: { coin: { decrement: game.bet } } }),
            prisma.user.update({ where: { id: game.guest.id }, data: { coin: { decrement: game.bet } } }),
          ]);
        }

        if (hostUser) {
          game.host.coin = hostUser.coin - game.bet;
          game.host.avatar = hostUser.avatar;
          game.host.currentFrame = hostUser.currentFrame || null;
          game.host.currentEffect = hostUser.currentEffect || null;
        }
        if (guestUser) {
          game.guest.coin = guestUser.coin - game.bet;
          game.guest.avatar = guestUser.avatar;
          game.guest.currentFrame = guestUser.currentFrame || null;
          game.guest.currentEffect = guestUser.currentEffect || null;
        }

        registerGame(game.host.id, 'ttt', gameId);
        registerGame(game.guest.id, 'ttt', gameId);

        game.status = 'active';
        game.roundScore = { host: 0, guest: 0 };
        game.currentRound = 1;
        game.lastRoundWinner = null;
        game.board = Array(9).fill(null);
        game.turn = 'host';
        game.moveCount = 0;
        game.winner = null;
        game.winningLine = null;
        game.rematchRequests = {};
        game.finishedAt = null;
        game.lastActivity = Date.now();

        io.to(gameId).emit('ttt:start', { game: sanitizeGame(game) });
        emitState(io, game);
      } catch (err) {
        console.error('ttt:rematch error:', err);
        emitError(socket, 'REMATCH_FAILED', 'Revansh so\'rovida xatolik');
      }
    });

    // Bekor qilish (xost, kutish xonasida)
    socket.on('ttt:cancel', (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        const role = getRole(game, userId);
        if (role !== 'host') return emitError(socket, 'NOT_HOST', 'Faqat xost bekor qila oladi');
        if (game.status !== 'waiting') return emitError(socket, 'CANNOT_CANCEL', 'Faqat kutish xonasi bekor qilinadi');

        game.status = 'cancelled';
        socket.leave(gameId);
        cleanupGame(gameId);
        socket.emit('ttt:cancelled', { gameId });
      } catch (err) {
        console.error('ttt:cancel error:', err);
        emitError(socket, 'CANCEL_FAILED', 'Bekor qilishda xatolik');
      }
    });

    socket.on('disconnect', () => handleDisconnect(io, socket));
  });
}
