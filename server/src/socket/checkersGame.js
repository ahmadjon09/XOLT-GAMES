// SHASHKA (CHECKERS) - 1v1 klassik shashka (coin bet + timer + public/private)
// chessGame.js asosida: majburiy olish, zanjirli olish (hop-by-hop), damka, durrang
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
  getLegalHops,
  applyHop,
  getGameStatus,
  moveNotation,
  rcToSquare,
} from '../utils/checkers.js';

const COMMISSION_RATE = 0.05;
const RECONNECT_TIMEOUT_MS = 30 * 1000;
const INACTIVE_CLEANUP_MS = 10 * 60 * 1000;
const FINISHED_CLEANUP_MS = 5 * 60 * 1000;
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
    chainFrom: game.chainFrom, // zanjirli olish davomida shu katakdan yurish shart
    lastMove: game.lastMove,
    captured: game.captured, // { w: [...olingan qora shashkalar], b: [...] }
    moves: game.moves, // { san, by }[]
    winner: game.winner,
    result: game.result, // 'nomoves' | 'draw30' | 'resign' | 'timeout' | null
    timeLeft: { host: game.timeLeft.host, guest: game.timeLeft.guest },
    rematchRequests: game.rematchRequests || {},
    createdAt: game.createdAt,
  };
}

function emitState(io, game) {
  io.to(game.gameId).emit('checkers:state', sanitizeGame(game));
}

// ---------- timer ----------
function resetTurnTimer(game) {
  if (game.timer) { clearInterval(game.timer); game.timer = null; }
  if (game.status === 'active' && game.timeControl > 0) {
    const role = game.turn === 'w' ? 'host' : 'guest';
    game.deadline = Date.now() + game.timeLeft[role] * 1000;
    game.timer = setInterval(() => {
      if (game.status !== 'active') {
        if (game.timer) clearInterval(game.timer);
        return;
      }
      const r = game.turn === 'w' ? 'host' : 'guest';
      game.timeLeft[r] = Math.max(0, game.timeLeft[r] - 1);
      if (ioRef) ioRef.to(game.gameId).emit('checkers:time', { role: r, timeLeft: game.timeLeft[r] });
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
      const loserRole = game.turn === 'w' ? 'host' : 'guest';
      finishGame(ioRef, game, loserRole === 'host' ? 'guest' : 'host', 'timeout');
    }
  }
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
export function getCheckersLobbyRooms() {
  const rooms = [];
  for (const game of games.values()) {
    if (game.status === 'waiting' && game.public) {
      rooms.push({
        gameId: game.gameId,
        type: 'checkers',
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
        console.error(`[checkers:${gameId}] bet qaytarishda xato:`, err);
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

async function finishGame(io, game, winnerRole, result = 'nomoves') {
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
      io.to(game.gameId).emit('checkers:end', {
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
      type: 'checkers',
      roomCode: game.gameId,
      winnerId,
      winnerName: winner.full_name,
      totalPlayers: 2,
      totalBets: totalPot,
      commission,
      payload: { result, moves: game.moves.length, loserId: winnerRole === 'host' ? game.guest.id : game.host.id },
    });

    io.to(game.gameId).emit('checkers:end', {
      winner: winnerRole,
      draw: false,
      result,
      payout,
      commission,
      earnedPoints: WINNER_SCORE_POINTS,
      game: sanitizeGame(game),
    });
  } catch (err) {
    console.error(`[checkers:${game.gameId}] natijani saqlashda xato:`, err);
    io.to(game.gameId).emit('error', { code: 'FINALIZE_FAILED', message: "O'yin natijasini saqlashda xatolik" });
  }
}

function handleDisconnect(io, socket) {
  const userId = socket.data.user && socket.data.user.id;
  if (!userId) return;
  if (userSocketMap.get(userId) !== socket.id) return;
  const entry = userGameMap.get(userId);
  if (!entry || entry.type !== 'checkers') return;
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

const isRC = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= 0 && x < 8);

// ---------- setup ----------
export function setupCheckersGame(io) {
  ioRef = io;

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    if (socket.data.user.kind !== 'user') return;

    // Aktiv o'yinni tiklash (refresh)
    socket.on('checkers:get_active', () => {
      const entry = userGameMap.get(userId);
      if (!entry || entry.type !== 'checkers') return;
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
          socket.emit('checkers:active', { game: sanitizeGame(game) });
        }
      } else {
        userGameMap.delete(userId);
      }
    });

    // Yaratish
    socket.on('checkers:create', async (payload) => {
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

        games.set(gameId, {
          gameId,
          host: buildPlayerData(user, socket.id),
          guest: null,
          status: 'waiting',
          public: !!isPublic,
          bet,
          timeControl: tc,
          board: initialBoard(),
          turn: 'w',
          chainFrom: null,
          lastMove: null,
          captured: { w: [], b: [] },
          moves: [],
          pendingSan: '',
          noProgress: 0,
          winner: null,
          result: null,
          hostBet: bet,
          guestBet: 0,
          timeLeft: { host: tc, guest: tc },
          deadline: null,
          rematchRequests: {},
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });

        registerGame(userId, 'checkers', gameId);
        userSocketMap.set(userId, socket.id);
        socket.join(gameId);
        socket.emit('checkers:created', { game: sanitizeGame(games.get(gameId)) });
      } catch (err) {
        console.error('checkers:create error:', err);
        emitError(socket, 'CREATE_FAILED', "O'yin yaratishda xatolik");
      }
    });

    // Qo'shilish
    socket.on('checkers:join', async (payload) => {
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

        registerGame(userId, 'checkers', gameId);
        userSocketMap.set(userId, socket.id);
        socket.join(gameId);

        io.to(gameId).emit('checkers:joined', { game: sanitizeGame(game) });
        io.to(gameId).emit('checkers:start', { game: sanitizeGame(game) });
        emitState(io, game);
      } catch (err) {
        console.error('checkers:join error:', err);
        emitError(socket, 'JOIN_FAILED', 'Qo\'shilishda xatolik');
      }
    });

    // Yurish (hop-by-hop: zanjirli olishda har bir sakrash alohida yuboriladi)
    socket.on('checkers:move', async (payload) => {
      try {
        const { gameId, from, to } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (game.status !== 'active') return emitError(socket, 'GAME_NOT_ACTIVE', 'O\'yin aktiv emas');

        const role = getRole(game, userId);
        if (!role) return emitError(socket, 'NOT_A_PLAYER', 'Siz bu o\'yinda emassiz');
        if (game.turn !== roleColor(role)) return emitError(socket, 'NOT_YOUR_TURN', 'Hozir sizning navbatingiz emas');
        if (!isRC(from) || !isRC(to)) return emitError(socket, 'INVALID_MOVE', 'Noto\'g\'ri katak');

        // Zanjirli olish davomida — faqat shu shashka bilan davom etish kerak
        if (game.chainFrom && (game.chainFrom[0] !== from[0] || game.chainFrom[1] !== from[1])) {
          return emitError(socket, 'MUST_CONTINUE', 'Oldin shu shashka bilan olishni davom ettiring');
        }

        const legal = getLegalHops(game.board, game.turn, game.chainFrom)
          .filter((m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]);
        if (legal.length === 0) return emitError(socket, 'ILLEGAL_MOVE', 'Bu yurish qoidalarga zid (olish majburiy)');
        const hop = legal[0];

        const wasMan = !['W', 'B'].includes(game.board[from[0]][from[1]]);
        const san = moveNotation(from, to, hop.capture);
        const res = applyHop(game.board, from, to);

        if (res.capturedPiece) game.captured[game.turn].push(res.capturedPiece);
        // zanjir yozuvi: c3:e5:g7
        game.pendingSan = game.pendingSan
          ? `${game.pendingSan}${hop.capture ? ':' : '-'}${rcToSquare(to)}`
          : moveNotation(from, to, hop.capture);
        game.lastMove = { from: [from[0], from[1]], to: [to[0], to[1]] };
        game.lastActivity = Date.now();

        // Zanjirli olish: yana olish mumkinmi?
        if (res.capture) {
          const more = getLegalHops(game.board, game.turn, [to[0], to[1]]);
          if (more.length > 0) {
            game.chainFrom = [to[0], to[1]];
            resetTurnTimer(game); // navbat o'zgarmaydi
            emitState(io, game);
            return;
          }
        }

        // Yurish yakunlandi — navbat raqibga
        game.chainFrom = null;
        game.moves.push({ san: game.pendingSan || san, by: role });
        game.pendingSan = '';
        if (res.capture || wasMan) game.noProgress = 0;
        else game.noProgress += 1;
        game.turn = game.turn === 'w' ? 'b' : 'w';

        const status = getGameStatus(game.board, game.turn, game.noProgress);
        if (status.over) {
          const winnerRole = status.winner === 'w' ? 'host' : status.winner === 'b' ? 'guest' : null;
          emitState(io, game);
          await finishGame(io, game, winnerRole, status.result);
          return;
        }

        resetTurnTimer(game);
        emitState(io, game);
      } catch (err) {
        console.error('checkers:move error:', err);
        emitError(socket, 'MOVE_FAILED', 'Yurish qayta ishlanmadi');
      }
    });

    // Topshirish (resign)
    socket.on('checkers:resign', async (payload) => {
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
        console.error('checkers:resign error:', err);
        emitError(socket, 'RESIGN_FAILED', 'Topshirishda xatolik');
      }
    });

    // Chiqish
    socket.on('checkers:leave', async (payload) => {
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
        console.error('checkers:leave error:', err);
        emitError(socket, 'LEAVE_FAILED', 'Chiqishda xatolik');
      }
    });

    // Bekor qilish (xost, kutishda)
    socket.on('checkers:cancel', (payload) => {
      try {
        const { gameId } = payload || {};
        const game = games.get(gameId);
        if (!game) return emitError(socket, 'GAME_NOT_FOUND', 'O\'yin topilmadi');
        if (getRole(game, userId) !== 'host') return emitError(socket, 'NOT_HOST', 'Faqat xost bekor qila oladi');
        if (game.status !== 'waiting') return emitError(socket, 'CANNOT_CANCEL', 'Faqat kutish xonasi bekor qilinadi');
        game.status = 'cancelled';
        socket.leave(gameId);
        cleanupGame(gameId);
        socket.emit('checkers:cancelled', { gameId });
      } catch (err) {
        console.error('checkers:cancel error:', err);
        emitError(socket, 'CANCEL_FAILED', 'Bekor qilishda xatolik');
      }
    });

    // Revansh
    socket.on('checkers:rematch', async (payload) => {
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
          socket.to(gameId).emit('checkers:rematch', { requestedBy: role });
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

        registerGame(game.host.id, 'checkers', gameId);
        registerGame(game.guest.id, 'checkers', gameId);

        game.status = 'active';
        game.board = initialBoard();
        game.turn = 'w';
        game.chainFrom = null;
        game.lastMove = null;
        game.captured = { w: [], b: [] };
        game.moves = [];
        game.pendingSan = '';
        game.noProgress = 0;
        game.winner = null;
        game.result = null;
        game.timeLeft = { host: game.timeControl, guest: game.timeControl };
        game.rematchRequests = {};
        game.finishedAt = null;
        game.lastActivity = Date.now();
        resetTurnTimer(game);

        io.to(gameId).emit('checkers:start', { game: sanitizeGame(game) });
        emitState(io, game);
      } catch (err) {
        console.error('checkers:rematch error:', err);
        emitError(socket, 'REMATCH_FAILED', 'Revansh so\'rovda xatolik');
      }
    });

    socket.on('disconnect', () => handleDisconnect(io, socket));
  });
}
