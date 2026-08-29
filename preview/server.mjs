// DEMO PREVIEW SERVER — DB'siz lokal demo (PostgreSQL kerak emas)
// Ishga tushirish: node --import ./preview/register-loader.mjs preview/server.mjs
// - client/dist statik beriladi (VITE_API_URL same-origin qilib build qilingan)
// - /api/auth/login, /api/auth/me, /api/user/* — demo ma'lumotlar
// - Socket.IO: HAQIQIY o'yin handlerlari (math, ttt, chess, shashka/checkers)
//   prisma stub orqali (preview/stub-prisma.mjs)
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { findOrCreateByPhone, getUser } from './stub-prisma.mjs';

const JWT_SECRET = 'preview-demo-secret';
const PORT = Number(process.env.PORT || 4173);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'client', 'dist');

// Haqiqiy o'yin handlerlari (prisma stub bilan — loader orqali almashtiriladi)
const { setupMathGame } = await import('../server/src/socket/mathGame.js');
const { setupTicTacToe } = await import('../server/src/socket/tictactoe.js');
const { setupChessGame } = await import('../server/src/socket/chessGame.js');
const { setupCheckersGame } = await import('../server/src/socket/checkersGame.js');
const { setupRaceGame } = await import('../server/src/socket/raceGame.js');
const { socketAuthenticate, checkConnectionLimit, registerEventRateLimit } = await import('../server/src/socket/shared.js');
const { getMathLobbyRooms } = await import('../server/src/socket/mathGame.js');
const { getTicTacToeLobbyRooms } = await import('../server/src/socket/tictactoe.js');
const { getChessLobbyRooms } = await import('../server/src/socket/chessGame.js');
const { getCheckersLobbyRooms } = await import('../server/src/socket/checkersGame.js');
const { getRaceLobbyRooms } = await import('../server/src/socket/raceGame.js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.map': 'application/json',
};

const ok = (data) => JSON.stringify({ success: true, data });
const err = (code, message) => JSON.stringify({ success: false, error: { code, message } });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // ---- API ----
  if (url.pathname.startsWith('/api/')) {
    const send404 = () => { res.statusCode = 404; res.end(err('NOT_FOUND', 'Demo serverda yo‘q: ' + url.pathname)); };

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { phone } = JSON.parse(body || '{}');
          if (!phone) { res.statusCode = 400; return res.end(err('PHONE_REQUIRED', 'Telefon kerak')); }
          const user = findOrCreateByPhone(String(phone).trim());
          const token = jwt.sign({ id: user.id, kind: 'user', role: 'STUDENT', full_name: user.full_name }, JWT_SECRET, { expiresIn: '30d' });
          res.end(ok({ token, profile: { ...user } }));
        } catch (e) {
          res.statusCode = 400;
          res.end(err('BAD_REQUEST', String(e.message)));
        }
      });
      return;
    }

    const auth = () => {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
    };

    if (url.pathname === '/api/auth/me') {
      const dec = auth();
      const u = dec && getUser(dec.id);
      if (!u) { res.statusCode = 401; return res.end(err('UNAUTHORIZED', 'Token yaroqsiz')); }
      return res.end(ok({ ...u }));
    }
    if (url.pathname === '/api/user/groups') return res.end(ok([]));
    if (url.pathname === '/api/user/group-ranking') return res.end(ok([]));
    if (url.pathname === '/api/games/lobby') {
      return res.end(ok([
        ...getMathLobbyRooms(),
        ...getTicTacToeLobbyRooms(),
        ...getChessLobbyRooms(),
        ...getCheckersLobbyRooms(),
        ...getRaceLobbyRooms(),
      ].sort((a, b) => b.createdAt - a.createdAt)));
    }
    return send404();
  }

  // ---- Statik (client/dist) ----
  let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(DIST)) { res.statusCode = 403; return res.end(err('FORBIDDEN', '')); }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html'); // SPA fallback
  }
  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

// ---- Socket.IO (haqiqiy handlerlar) ----
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

// socketAuthenticate real JWT_SECRET ishlatadi (env default) — demo sirlar bilan
// yozilgan tokenlarni qabul qilish uchun auth'ni o'zimiz bajaraylik:
io.use((socket, next) => {
  try {
    let token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      const header = socket.handshake.headers && socket.handshake.headers.authorization;
      if (header && header.startsWith('Bearer ')) token = header.slice(7);
    }
    if (!token) return next(new Error('AUTH_TOKEN_MISSING'));
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.data.user = {
      id: decoded.id,
      kind: decoded.kind,
      role: decoded.kind === 'staff' ? decoded.role : 'STUDENT',
      full_name: decoded.full_name,
    };
    next();
  } catch (e) {
    next(new Error('AUTH_INVALID_TOKEN'));
  }
});
io.use(checkConnectionLimit);
io.on('connection', (socket) => {
  registerEventRateLimit(socket);
  socket.on('ping', (cb) => { if (typeof cb === 'function') cb({ ok: true, t: Date.now() }); });
});

setupMathGame(io);
setupTicTacToe(io);
setupChessGame(io);
setupCheckersGame(io);
setupRaceGame(io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[preview] Demo server: http://0.0.0.0:${PORT} (DB'siz, xotira rejimi)`);
  console.log('[preview] Login: istalgan telefon raqami + parol (masalan: 901234567 / 12345)');
  console.log('[preview] Ikki brauzer varag\'ida har xil raqam bilan kirsangiz — bir-biringiz bilan o\'ynaysiz');
});
