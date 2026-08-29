// Socket.IO sozlash - auth, rate limit va barcha o'yinlar
import { Server } from 'socket.io';
import { socketAuthenticate, checkConnectionLimit, registerEventRateLimit } from './shared.js';
import { setupMathGame } from './mathGame.js';
import { setupQuizGame } from './quizGame.js';
import { setupTicTacToe } from './tictactoe.js';
import { setupTypingRace } from './typingRace.js';
import { setupCodeBattle } from './codeBattle.js';
import { setupChessGame } from './chessGame.js';

export function setupSocket(httpServer, corsOrigins) {
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

  // Auth + ulanish cheklovi
  io.use(socketAuthenticate);
  io.use(checkConnectionLimit);

  io.on('connection', (socket) => {
    registerEventRateLimit(socket);

    // PING - frontend ulanganligini tekshiradi
    socket.on('ping', (cb) => {
      if (typeof cb === 'function') cb({ ok: true, t: Date.now() });
    });
  });

  // O'yinlarni ulash
  setupMathGame(io);
  setupQuizGame(io);
  setupTicTacToe(io);
  setupTypingRace(io);
  setupCodeBattle(io);
  setupChessGame(io);
  setupCheckersGame(io);

  return io;
}
