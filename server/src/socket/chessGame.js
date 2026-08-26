// CHESS - 1v1 to'liq qoidalari bilan shaxmat o'yini (coin bet + timer + public/private)
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
import {
  initialBoard,
  initialState,
  cloneBoard,
  applyMove,
  getLegalMoves,
  getGameStatus,
  toSAN,
  squareToRC,
  positionKey,
} from '../utils/chess.js';

const COMMISSION_RATE = 0.05;
const RECONNECT_TIMEOUT_MS = 30 * 1000;
const INACTIVE_CLEANUP_MS = 10 * 60 * 1000;
const FINISHED_CLEANUP_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const WINNER_SCORE_POINTS = 25;
const DRAW_SCORE_POINTS = 10;

const games = new Map();
const disconnectTimers = new Map();

// ---------- helpers ----------
function getRole(game, userId) {
  if (game.host && game.host.id === userId) return 'host';
  if (game.guest && game.guest.id === userId) return 'guest';
  return null;
}

function roleColor(role) {
  return role === 'host' ? 'w' : 'b';
}

function sanitizeGame(game) {
  return {
    gameId: game.gameId,
    host: sanitizePlayer(game.host),
    guest: sanitizePlayer(game.guest),
    status: game.status,
    public: game.public,
    bet: game.bet,
    timeControl: game.timeControl,
    board: game.board,
    turn: game.turn, // 'w' | 'b'
    castling: game.castling,
    enPassant: game.enPassant,
    fullmove: game.fullmove,
    halfmove: game.halfmove,
    lastMove: game.lastMove,
    check: game.check,
    captured: game.captured, // { w: [...qora olingan oq figuralar], b: [...] }
    moves: game.moves, // { san, from, to }[]
    winner: game.winner, // 'host' | 'guest' | null
    result: game.result, // 'checkmate' | 'stalemate' | 'fifty' | 'threefold' | 'material' | 'resign' | 'timeout' | null
    timeLeft: { host: game.timeLeft.host, guest: game.timeLeft.guest },
    rematchRequests: game.rematchRequests || {},
    createdAt: game.createdAt,
  };
}

function capturedFromMove(board, from, to, enPassant) {
  const p = board[to[0]][to[1]];
  if (p) return p;
  if (enPassant) return board[from[0]][to[1]];
  return null;
}

function emitState(io, game) {
  io.to(game.gameId).emit('chess:state', sanitizeGame(game));
}

// ---------- timer ----------
function resetTurnTimer(game) {
  if (game.timer) { clearInterval(game.timer); game.timer = null; }
  if (game.status === 'active' && game.timeControl > 0) {
    const role = game.turn === 'w' ? 'host' : 'guest';
    game.deadline = Date.now() + game.timeLeft[role] * 1000;
    // Har soniyada timeLeft'ni kamaytirib, client'ga sync yuboramiz
    game.timer = setInterval(() => {
      if (game.status !== 'active') {
        if (game.timer) clearInterval(game.timer);
        return;
      }
      const r = game.turn === 'w' ? 'host' : 'guest';
      game.timeLeft[r] = Math.max(0, game.timeLeft[r] - 1);
      if (ioRef) ioRef.to(game.gameId).emit('chess:time', { role: r, timeLeft: game.timeLeft[r] });
      if (game.timeLeft[r] <= 0) {
        if (game.timer) clearInterval(game.timer);
        finishGame(ioRef, game, r === 'host' ? 'guest' : 'host', 'timeout');
      }
    }, 1000);
  } else {
    game.deadline = null;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const game of games.values()) {
    if (game.status === 'active' && game.timeControl > 0 && game.deadline && now > game.deadline) {
      // Vaqt tugadi - navbatdagi o'yinchi yutqazadi
      const loserRole = game.turn === 'w' ? 'host' : 'guest';
      finishGame(ioRef, game, loserRole === 'host' ? 'guest' : 'host', 'timeout');
    }
  }
  // tozalash
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
}, 1000);

let ioRef = null;

// ---------- lobby ----------
export function getChessLobbyRooms() {
  const rooms = [];
  for (const game of games.values()) {
    if (game.status === 'waiting' && game.public) {
      rooms.push({
        gameId: game.gameId,
        type: 'chess',
        host: {
          id: game.host.id,
          full_name: game.host.full_name,
          avatar: game.host.avatar,
          currentFrame: game.host.currentFrame,
          currentEffect: game.host.currentEffect,
        },
        bet: game.bet,
        timeControl: game.timeControl,
        createdAt: game.createdAt,
      });
    }
  }
  return rooms;
}

// ---------- game flow ----------
async function cleanupGame(gameId) {
  const game = games.get(gameId);
  const timers = disconnectTimers.get(gameId);
  if (timers) {
    if (timers.host) clearTimeout(timers.host);
    if (timers.guest) clearTimeout(timers.guest);
    disconnectTimers.delete(gameId);
  }
  if (game) {
    if (game.timer) { clearInterval(game.timer); game.timer = null; }
    if (game.status === 'active' && game.bet > 0) {
      try {
        await prisma.$transaction([
          prisma.user.update({ where: { id: game.host.id }, data: { coin: { increment: game.hostBet } } }),
          prisma.user.update({ where: { id: game.guest.id }, data: { coin: { increment: game.guestBet } } }),
        ]);
      } catch (err) {
        console.error(`[chess:${gameId}] bet qaytarishda xato:`, err);
      }
    }
    clearUserMaps(game);
  }
  games.delete(gameId);
}

function clearUserMaps(game) {
  if (game.host && userGameMap.get(game.host.id)?.id === game.gameId) userGameMap.delete(game.host.id);
  if (game.guest && userGameMap.get(game.guest.id)?.id === game.gameId) userGameMap.delete(game.guest.id);
}

function clearDisconnectTimer(gameId, role) {
  const timers = disconnectTimers.get(gameId);
  if (timers && timers[role]) {
    clearTimeout(timers[role]);
    delete timers[role];
  }
}

async function finishGame(io, game, winnerRole, result = 'checkmate') {
  try {
    game.status = 'finished';
    game.winner = winnerRole;
    game.result = result;
    game.finishedAt = Date.now();
    game.lastActivity = Date.now();
    game.deadline = null;
    if (game.timer) { clearInterval(game.timer); game.timer = null; }
    clearUserMaps(game);

    // Durrang — bet qaytariladi
    if (!winnerRole) {
      if (game.bet > 0) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: game.host.id }, data: { coin: { increment: game.hostBet } } }),
          prisma.user.update({ where: { id: game.guest.id }, data: { coin: { increment: game.guestBet } } }),
        ]);
      }
      await prisma.$transaction([
        prisma.user.update({ where: { id: game.host.id }, data: { score: { increment: DRAW_SCORE_POINTS } } }),
        prisma.user.update({ where: { id: game.guest.id }, data: { score: { increment: DRAW_SCORE_POINTS } } }),
      ]);
      io.to(game.gameId).emit('chess:end', {
        winner: null,
        draw: true,
        result,
        payout: 0,
        commission: 0,
        earnedPoints: DRAW_SCORE_POINTS,
        game: sanitizeGame(game),
      });
      return;
    }

    const winnerId = winnerRole === 'host' ? game.host.id : game.guest.id;
    const loserId = winnerRole === 'host' ? game.guest.id : game.host.id;
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

    const winner = winnerRole === 'host' ? game.host : game.guest;
    await recordGame({
      type: 'chess',
      roomCode: game.gameId,
      winnerId,
      winnerName: winner.full_name,
      totalPlayers: 2,
      totalBets: totalPot,
      commission,
      payload: { result, moves: game.moves.length, loserId },
    });

    io.to(game.gameId).emit('chess:end', {
      winner: winnerRole,
      draw: false,
      result,
      payout,
      commission,
      earnedPoints: WINNER_SCORE_POINTS,
      game: sanitizeGame(game),
    });
  } catch (err) {
    console.error(`[chess:${gameId}] natijani saqlashda xato:`, err);
    io.to(game.gameId).emit('error', { code: 'FINALIZE_FAILED', message: "O'yin natijasini saqlashda xatolik" });
  }
}

function handleDisconnect(io, socket) {
  const userId = socket.data.user && socket.data.user.id;
  if (!userId) return;
  if (userSocketMap.get(userId) !== socket.id) return;
  const entry = userGameMap.get(userId);
  if (!entry || entry.type !== 'chess') return;
  const game = games.get(entry.id);
  if (!game) return;
  const role = getRole(game, userId);
  if (!role) return;

  game[role].connected = false;
  game.lastActivity = Date.now();
  if (game.status !== 'active' && game.status !== 'waiting') return;

  io.to(game.gameId).emit('player:left', { role, userId, temporary: true });
  if (!disconnectTimers.has(game.gameId)) disconnectTimers.set(game.gameId, {});
  const timers = disconnectTimers.get(game.gameId);
  timers[role] = setTimeout(async () => {
    const currentGame = games.get(game.gameId);
    if (!currentGame || currentGame.status === 'cancelled') return;
    if (currentGame[role] && currentGame[role].connected) return;
    if (currentGame.status === 'active') {
      const opponentRole = role === 'host' ? 'guest' : 'host';
      if (currentGame[opponentRole]) await finishGame(io, currentGame, opponentRole, 'timeout');
      else cleanupGame(game.gameId);
    } else {
      cleanupGame(game.gameId);
    }
  }, RECONNECT_TIMEOUT_MS);
}

// ---------- setup ----------
export function setupChessGame(io) {
  ioRef = io;

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    if (socket.data.user.kind !== 'user') return;

    // Aktiv o'yinni tiklash (refresh)
    socket.on('chess:get_active', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'chess') return;
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
          socket.emit('chess:active', { game: sanitizeGame(game) });
        }
      } else {
        userGameMap.delete(userId);
      }
    });

    // Yaratish
    socket.on('chess:create', async (payload) => {
      try {
        const { bet, timeControl, isPublic } = payload || {};
        if (typeof bet !== 'number' || !Number.isInteger(bet) || bet < 0) {
          return emitError(socket, 'INVALID_BET', "Bet musbat butun son bo'lishi kerak");
        }
        const tc = [0, 30, 60, 90, 120, 180].includes(Number(timeControl)) ? Number(timeControl) : 90;
        if (userGameMap.has(userId)) return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon aktiv o\'yindasiz');

        const user = await fetchFullUser(userId);
        if (!user) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');
        if (bet > 0 && user.coin < bet) return emitError(socket, 'INSUFFICIENT_COINS', 'Yetarli coin yo\'q');

        let gameId;
        do {
          gameId = String(Math.floor(100000 + Math.random() * 900000));
        } while (games.has(gameId));

        const board = initialBoard();
        const state = initialState();
        games.set(gameId, {
          gameId,
          host: buildPlayerData(user, socket.id),
          guest: null,
          status: 'waiting',
          public: !!isPublic,
          bet,
          timeControl: tc,
          board,
          turn: 'w',
          castling: state.castling,
          enPassant: null,
          fullmove: 1,
          halfmove: 0,
          lastMove: null,
          check: false,
          captured: { w: [], b: [] },
          moves: [],
          winner: null,
          result: null,
          hostBet: bet,
          guestBet: 0,
          timeLeft: { host: tc, guest: tc },
          deadline: null,
          positionCounts: new Map([[positionKey(board, state), 1]]),
          rematchRequests: {},
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });

        registerGame(userId, 'chess', gameId);
        userSocketMap.set(userId, socket.id);
        socket.join(gameId);
        socket.emit('chess:created', { game: sanitizeGame(games.get(gameId)) });
      } catch (err) {
        console.error('chess:create error:', err);
        emitError(socket, 'CREATE_FAILED', "O'yin yaratishda xatolik");
      }
    });

    // Qo'shilish
    socket.on('chess:join', async (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'waiting') return emitError(socket, 'GAME_NOT_JOINABLE', 'Bu o\'yinga qo\'shilib bo\'lmaydi');
        if (game.guest) return emitError(socket, 'GAME_FULL', "O'yin to'la");
        if (game.host.id === userId) return emitError(socket, 'CANNOT_JOIN_OWN_GAME', "O'z o'yiningizga qo'shila olmaysiz");
        if (userGameMap.has(userId)) return emitError(socket, 'ALREADY_IN_GAME', 'Siz allaqachon aktiv o\'yindasiz');

        const user = await fetchFullUser(userId);
        if (!user) return emitError(socket, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');
        if (game.bet > 0) {
          if (user.coin < game.bet) return emitError(socket, 'INSUFFICIENT_COINS', "Qo'shilish uchun yetarli coin yo'q");
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
        game.turn = 'w';
        game.lastActivity = Date.now();
        resetTurnTimer(game);

        registerGame(userId, 'chess', gameId);
        userSocketMap.set(userId, socket.id);
        socket.join(gameId);

        io.to(gameId).emit('chess:joined', { game: sanitizeGame(game) });
        io.to(gameId).emit('chess:start', { game: sanitizeGame(game) });
        emitState(io, game);
      } catch (err) {
        console.error('chess:join error:', err);
        emitError(socket, 'JOIN_FAILED', 'Qo\'shilishda xatolik');
      }
    });

    // Yurish
    socket.on('chess:move', async (payload) => {
      try {
        const { gameId, from, to, promotion } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'active') return emitError(socket, 'GAME_NOT_ACTIVE', 'O\'yin aktiv emas');

        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');
        if (game.turn !== roleColor(role)) return emitError(socket, 'NOT_YOUR_TURN', 'Hozir sizning navbatingiz emas');

        let fr, ff, tr, tf;
        try {
          [fr, ff] = squareToRC(from);
          [tr, tf] = squareToRC(to);
        } catch (e) {
          return emitError(socket, 'INVALID_MOVE', 'Noto\'g\'ri katak');
        }
        if (fr === undefined || ff === undefined || tr === undefined || tf === undefined) {
          return emitError(socket, 'INVALID_MOVE', 'Noto\'g\'ri katak');
        }

        // Legal yurishlarni top
        const legal = getLegalMoves(game.board, {
          turn: game.turn,
          castling: game.castling,
          enPassant: game.enPassant,
          halfmove: game.halfmove,
          fullmove: game.fullmove,
        }, [fr, ff]).filter((m) => m.to[0] === tr && m.to[1] === tf);

        if (legal.length === 0) return emitError(socket, 'ILLEGAL_MOVE', 'Bu yurish qoidalarga zid');

        let move = legal[0];
        if (move.promotion && promotion) {
          move = legal.find((m) => m.promotion === promotion) || move;
        }

        // SAN (holat o'zgarishidan oldin)
        const stateLike = {
          turn: game.turn,
          castling: game.castling,
          enPassant: game.enPassant,
          halfmove: game.halfmove,
          fullmove: game.fullmove,
        };
        const san = toSAN(game.board, stateLike, move);

        // Qo'llash
        const color = game.turn;
        const captured = capturedFromMove(game.board, move.from, move.to, move.enPassant);
        applyMove(game.board, stateLike, move);

        if (captured) game.captured[color].push(captured);

        game.castling = stateLike.castling;
        game.enPassant = stateLike.enPassant;
        game.fullmove = stateLike.fullmove;
        game.halfmove = stateLike.halfmove;
        game.turn = stateLike.turn;
        game.lastMove = { from: [fr, ff], to: [tr, tf] };
        game.moves.push({ san, from: [fr, ff], to: [tr, tf], by: role, castle: move.castle || null });
        game.lastActivity = Date.now();

        const key = positionKey(game.board, {
          turn: game.turn,
          castling: game.castling,
          enPassant: game.enPassant,
          halfmove: game.halfmove,
          fullmove: game.fullmove,
        });
        game.positionCounts.set(key, (game.positionCounts.get(key) || 0) + 1);

        const status = getGameStatus(game.board, {
          turn: game.turn,
          castling: game.castling,
          enPassant: game.enPassant,
          halfmove: game.halfmove,
          fullmove: game.fullmove,
        }, game.positionCounts);
        game.check = status.check;

        if (status.over) {
          const winnerRole = status.result === 'checkmate' ? (color === 'w' ? 'host' : 'guest') : null;
          emitState(io, game);
          await finishGame(io, game, winnerRole, status.result);
          return;
        }

        resetTurnTimer(game);
        emitState(io, game);
      } catch (err) {
        console.error('chess:move error:', err);
        emitError(socket, 'MOVE_FAILED', 'Yurish qayta ishlanmadi');
      }
    });

    // Topshirish (resign)
    socket.on('chess:resign', async (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'active') return emitError(socket, 'GAME_NOT_ACTIVE', 'O\'yin aktiv emas');
        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');
        const winnerRole = role === 'host' ? 'guest' : 'host';
        emitState(io, game);
        await finishGame(io, game, winnerRole, 'resign');
      } catch (err) {
        console.error('chess:resign error:', err);
        emitError(socket, 'RESIGN_FAILED', 'Topshirishda xatolik');
      }
    });

    // Chiqish
    socket.on('chess:leave', async (payload) => {
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
          if (game[opponentRole]) await finishGame(io, game, opponentRole, 'resign');
          else cleanupGame(gameId);
        } else if (game.status === 'waiting') {
          io.to(gameId).emit('player:left', { role, userId, temporary: false });
          cleanupGame(gameId);
        } else {
          io.to(gameId).emit('player:left', { role, userId, temporary: false });
        }
      } catch (err) {
        console.error('chess:leave error:', err);
        emitError(socket, 'LEAVE_FAILED', 'Chiqishda xatolik');
      }
    });

    // Bekor qilish (xost, kutishda)
    socket.on('chess:cancel', (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (getRole(game, userId) !== 'host') return emitError(socket, 'NOT_HOST', 'Faqat xost bekor qila oladi');
        if (game.status !== 'waiting') return emitError(socket, 'CANNOT_CANCEL', 'Faqat kutish xonasi bekor qilinadi');
        game.status = 'cancelled';
        socket.leave(gameId);
        cleanupGame(gameId);
        socket.emit('chess:cancelled', { gameId });
      } catch (err) {
        console.error('chess:cancel error:', err);
        emitError(socket, 'CANCEL_FAILED', 'Bekor qilishda xatolik');
      }
    });

    // Revansh
    socket.on('chess:rematch', async (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'finished') return emitError(socket, 'GAME_NOT_FINISHED', "Faqat tugagan o'yin uchun");
        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');

        game.rematchRequests = game.rematchRequests || {};
        game.rematchRequests[role] = true;
        game.lastActivity = Date.now();
        const opponentRole = role === 'host' ? 'guest' : 'host';
        if (!game.rematchRequests[opponentRole]) {
          socket.to(gameId).emit('chess:rematch', { requestedBy: role });
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

        registerGame(game.host.id, 'chess', gameId);
        registerGame(game.guest.id, 'chess', gameId);

        const state = initialState();
        game.status = 'active';
        game.board = initialBoard();
        game.turn = 'w';
        game.castling = state.castling;
        game.enPassant = null;
        game.fullmove = 1;
        game.halfmove = 0;
        game.lastMove = null;
        game.check = false;
        game.captured = { w: [], b: [] };
        game.moves = [];
        game.winner = null;
        game.result = null;
        game.timeLeft = { host: game.timeControl, guest: game.timeControl };
        game.positionCounts = new Map();
        game.rematchRequests = {};
        game.finishedAt = null;
        game.lastActivity = Date.now();
        resetTurnTimer(game);

        io.to(gameId).emit('chess:start', { game: sanitizeGame(game) });
        emitState(io, game);
      } catch (err) {
        console.error('chess:rematch error:', err);
        emitError(socket, 'REMATCH_FAILED', 'Revansh so\'rovda xatolik');
      }
    });

    socket.on('disconnect', () => handleDisconnect(io, socket));
  });
}
