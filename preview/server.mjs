// OAuth-backed in-memory preview server. No PostgreSQL, MongoDB, or Redis required.
// Run: node --import ./preview/register-loader.mjs preview/server.mjs
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../server/src/config/env.js';
import { mockApi, db, findUser, findStaff } from './mock-api.mjs';

const JWT_SECRET = env.jwtSecret;
const PORT = Number(process.env.PORT || 4173);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'client', 'dist');

const { setupMathGame } = await import('../server/src/socket/mathGame.js');
const { setupQuizGame } = await import('../server/src/socket/quizGame.js');
const { setupTicTacToe } = await import('../server/src/socket/tictactoe.js');
const { setupTypingRace } = await import('../server/src/socket/typingRace.js');
const { setupCodeBattle } = await import('../server/src/socket/codeBattle.js');
const { setupChessGame } = await import('../server/src/socket/chessGame.js');
const { setupCheckersGame } = await import('../server/src/socket/checkersGame.js');
const { socketAuthenticate, checkConnectionLimit, registerEventRateLimit } = await import('../server/src/socket/shared.js');
const { attachCapacityGuard } = await import('../server/src/socket/capacityGuard.js');
const { startCapacityMonitor, setSocketCounter } = await import('../server/src/utils/capacity.js');
const { capacitySummary } = await import('../server/src/middleware/capacity.js');
const { getMathLobbyRooms } = await import('../server/src/socket/mathGame.js');
const { getTicTacToeLobbyRooms } = await import('../server/src/socket/tictactoe.js');
const { getChessLobbyRooms } = await import('../server/src/socket/chessGame.js');
const { getCheckersLobbyRooms } = await import('../server/src/socket/checkersGame.js');
const { getTypingLobbyRooms } = await import('../server/src/socket/typingRace.js');
const { getCodeLobbyRooms } = await import('../server/src/socket/codeBattle.js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.map': 'application/json',
};
const ok = (data, meta) => JSON.stringify(meta ? { success: true, data, meta } : { success: true, data });
const fail = (code, message) => JSON.stringify({ success: false, error: { code, message } });

const cookieValue = (header, name) => {
  const entry = String(header || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return null; }
};
const tokenFromRequest = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return cookieValue(req.headers.cookie, 'xolt_token');
};
const authFromRequest = (req) => {
  try { return tokenFromRequest(req) ? jwt.verify(tokenFromRequest(req), JWT_SECRET) : null; } catch { return null; }
};

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) { req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const contentType = String(req.headers['content-type'] || '');
    if (contentType.includes('multipart/form-data')) {
      const raw = buffer.toString('latin1');
      const folder = raw.match(/name="folder"\r\n\r\n([^\r\n]+)/)?.[1] || 'avatars';
      resolve({ folder, hasFile: /filename="[^"]+"/.test(raw) });
      return;
    }
    try { resolve(buffer.length ? JSON.parse(buffer.toString('utf8')) : {}); } catch { resolve({}); }
  });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://preview.local');
  if (url.pathname.startsWith('/api/')) {
    const auth = authFromRequest(req);
    const providerMatch = url.pathname.match(/^\/api\/auth\/oauth\/(google|github)$/);

    if (url.pathname === '/api/auth/providers') return res.end(ok({ google: true, github: true }));
    if (providerMatch && req.method === 'GET') {
      const asAdmin = url.searchParams.get('role') === 'admin';
      const principal = asAdmin ? findStaff('s_admin') : findUser('u1');
      const payload = asAdmin
        ? { id: principal.id, kind: 'staff', role: 'ADMIN', full_name: principal.full_name }
        : { id: principal.id, kind: 'user', full_name: principal.full_name };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
      res.setHeader('Set-Cookie', `xolt_token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
      res.statusCode = 302;
      res.setHeader('Location', '/');
      return res.end();
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', 'xolt_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
      return res.end(ok({ message: 'Signed out' }));
    }
    if (url.pathname === '/api/health') return res.end(ok(capacitySummary()));

    const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
    if (url.pathname === '/api/upload' && req.method === 'POST') {
      if (!auth) { res.statusCode = 401; return res.end(fail('UNAUTHORIZED', 'Sign in required')); }
      if (!body.hasFile) { res.statusCode = 400; return res.end(fail('NO_FILE', 'Choose an image')); }
      const folder = body.folder || 'avatars';
      if (folder === 'covers' && auth.kind !== 'user') { res.statusCode = 403; return res.end(fail('AUTH_FORBIDDEN', 'Only player profiles have covers')); }
      const user = auth.kind === 'user' ? findUser(auth.id) : null;
      const staff = auth.kind === 'staff' ? findStaff(auth.id) : null;
      const color = folder === 'covers' ? '#5b21b6' : '#0ea5e9';
      const urlValue = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400"><defs><linearGradient id="g"><stop stop-color="${color}"/><stop offset="1" stop-color="#fdc700"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/></svg>`)}`;
      if (folder === 'covers' && user) user.coverImage = urlValue;
      if (folder === 'avatars' && (user || staff)) (user || staff).avatar = urlValue;
      return res.end(ok({ url: urlValue, folder, filename: 'preview-image.png', host: 'preview' }));
    }

    if (url.pathname === '/api/games/lobby') {
      const rooms = [...getMathLobbyRooms(), ...getTicTacToeLobbyRooms(), ...getChessLobbyRooms(), ...getCheckersLobbyRooms(), ...getTypingLobbyRooms(), ...getCodeLobbyRooms()];
      return res.end(ok(rooms.sort((a, b) => b.createdAt - a.createdAt)));
    }

    const out = mockApi({ method: req.method, path: url.pathname, query: url.searchParams, body, auth });
    if (!out) { res.statusCode = 404; return res.end(fail('NOT_FOUND', `Preview API does not define ${url.pathname}`)); }
    if (out.error) { res.statusCode = out.status || 400; return res.end(fail(out.error.code, out.error.message)); }
    res.statusCode = out.status || 200;
    return res.end(ok(out.data, out.meta));
  }

  const candidate = path.resolve(DIST, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!candidate.startsWith(`${DIST}${path.sep}`) && candidate !== path.join(DIST, 'index.html')) {
    res.statusCode = 403;
    return res.end(fail('FORBIDDEN', 'Invalid path'));
  }
  const isFile = (file) => fs.existsSync(file) && fs.statSync(file).isFile();
  const filePath = isFile(candidate) ? candidate : path.join(DIST, 'index.html');
  if (!isFile(filePath)) { res.statusCode = 500; return res.end(fail('DIST_NOT_BUILT', 'Build the client first: npm run build')); }
  res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
});
io.use(socketAuthenticate);
io.use(checkConnectionLimit);
startCapacityMonitor();
setSocketCounter(() => io.engine?.clientsCount ?? 0);
io.on('connection', (socket) => {
  attachCapacityGuard(socket);
  registerEventRateLimit(socket);
  socket.on('ping', (callback) => { if (typeof callback === 'function') callback({ ok: true, t: Date.now() }); });
  socket.on('server:status', (callback) => { if (typeof callback === 'function') callback(capacitySummary()); });
});

setupMathGame(io);
setupQuizGame(io);
setupTicTacToe(io);
setupTypingRace(io);
setupCodeBattle(io);
setupChessGame(io);
setupCheckersGame(io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[preview] OAuth demo available on http://0.0.0.0:${PORT}`);
  console.log('[preview] Google/GitHub buttons sign in as demo player u1. Admin: /api/auth/oauth/google?role=admin');
});
