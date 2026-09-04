// DEMO PREVIEW SERVER — DB'siz lokal demo (PostgreSQL kerak emas)
// Ishga tushirish: node --import ./preview/register-loader.mjs preview/server.mjs
// - client/dist statik beriladi (VITE_API_URL same-origin qilib build qilingan)
// - /api/* — preview/mock-api.mjs dagi to'liq demo ma'lumotlar (student + admin panel)
// - Socket.IO: HAQIQIY o'yin handlerlari (math, ttt, chess, shashka/checkers, race)
//   prisma stub orqali (preview/stub-prisma.mjs)
//
// Demo hisoblar:
//   Admin     +998901234567 / admin123
//   Kassir    +998901234568 / cashier123
//   O'qituvchi +998901234569 / teacher123
//   O'quvchi   istalgan raqam (masalan 901111111 / 1234)
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { mockApi } from './mock-api.mjs';

const JWT_SECRET = 'preview-demo-secret';
const PORT = Number(process.env.PORT || 4173);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'client', 'dist');
const UPLOADS = path.join(__dirname, '..', 'server', 'uploads');

// Haqiqiy o'yin handlerlari (prisma stub bilan — loader orqali almashtiriladi)
const { setupMathGame } = await import('../server/src/socket/mathGame.js');
const { setupTicTacToe } = await import('../server/src/socket/tictactoe.js');
const { setupChessGame } = await import('../server/src/socket/chessGame.js');
const { setupCheckersGame } = await import('../server/src/socket/checkersGame.js');
const { setupRaceGame } = await import('../server/src/socket/raceGame.js');
// 3D poyga (server-avtoritar, binary protokol) — xuddi production'dagi modul
const { setupRace3D } = await import('../server/src/socket/race3d.js');
const { RACE3D_REALTIME_EVENTS } = await import('../server/src/socket/race3d.js');
const { socketAuthenticate, checkConnectionLimit, registerEventRateLimit } = await import('../server/src/socket/shared.js');
// Sig'im qo'riqchisi (RAM to'lganda yangi o'yin ochilmaydi) — production bilan bir xil
const { attachCapacityGuard } = await import('../server/src/socket/capacityGuard.js');
const { startCapacityMonitor, setSocketCounter } = await import('../server/src/utils/capacity.js');
const { capacitySummary } = await import('../server/src/middleware/capacity.js');
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

const ok = (data, meta) => JSON.stringify(meta ? { success: true, data, meta } : { success: true, data });
const err = (code, message) => JSON.stringify({ success: false, error: { code, message } });

const readBody = (req) =>
  new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // ---- API ----
  if (url.pathname.startsWith('/api/')) {
    const headerToken = () => {
      const h = req.headers.authorization || '';
      if (!h.startsWith('Bearer ')) return null;
      try { return jwt.verify(h.slice(7), JWT_SECRET); } catch { return null; }
    };

    let body = {};
    if (req.method !== 'GET' && req.method !== 'HEAD') body = await readBody(req);

    if (url.pathname === '/api/health') {
      return res.end(ok(capacitySummary()));
    }

    if (url.pathname === '/api/games/lobby') {
      return res.end(
        ok([
          ...getMathLobbyRooms(),
          ...getTicTacToeLobbyRooms(),
          ...getChessLobbyRooms(),
          ...getCheckersLobbyRooms(),
          ...getRaceLobbyRooms(),
        ].sort((a, b) => b.createdAt - a.createdAt))
      );
    }

    const out = mockApi({
      method: req.method,
      path: url.pathname,
      query: url.searchParams,
      body,
      auth: headerToken(),
      JWT_SECRET,
      jwt,
      uploadsDir: UPLOADS,
    });

    if (!out) {
      res.statusCode = 404;
      return res.end(err('NOT_FOUND', 'Demo serverda yo‘q: ' + url.pathname));
    }
    if (out.error) {
      res.statusCode = out.status || 400;
      return res.end(err(out.error.code, out.error.message));
    }
    res.statusCode = out.status || 200;
    return res.end(ok(out.data, out.meta));
  }

  // ---- Statik (client/dist) ----
  let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(DIST)) { res.statusCode = 403; return res.end(err('FORBIDDEN', '')); }
  const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
  if (!isFile(filePath)) {
    const name = path.basename(url.pathname);
    const uploadPath = name ? path.join(UPLOADS, name) : '';
    if (uploadPath && isFile(uploadPath)) {
      filePath = uploadPath;
    } else {
      filePath = path.join(DIST, 'index.html'); // SPA fallback
    }
  }
  // MUHIM: katalogni o'qishga urinish serverni qulatardi (EISDIR) — himoya.
  if (!isFile(filePath)) {
    res.statusCode = 500;
    return res.end(err('DIST_NOT_BUILT', "client/dist topilmadi — avval: cd client && npm run build"));
  }
  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => { res.statusCode = 500; res.end(err('READ_ERROR', '')); });
  stream.pipe(res);
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
startCapacityMonitor();
setSocketCounter(() => io.engine?.clientsCount ?? 0);
io.on('connection', (socket) => {
  attachCapacityGuard(socket);
  registerEventRateLimit(socket, { exemptEvents: RACE3D_REALTIME_EVENTS });
  socket.on('ping', (cb) => { if (typeof cb === 'function') cb({ ok: true, t: Date.now() }); });
  socket.on('server:status', (cb) => { if (typeof cb === 'function') cb(capacitySummary()); });
});

setupMathGame(io);
setupTicTacToe(io);
setupChessGame(io);
setupCheckersGame(io);
setupRaceGame(io);
setupRace3D(io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[preview] Demo server: http://0.0.0.0:${PORT} (DB'siz, xotira rejimi)`);
  console.log('[preview] Admin: 901234567 / admin123 • Kassir: 901234568 • O‘qituvchi: 901234569');
  console.log('[preview] O‘quvchi: istalgan raqam (masalan 901111111)');
});
