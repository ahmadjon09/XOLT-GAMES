// XOLT Games - server kirish nuqtasi
import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { prisma } from './prisma/client.js';
import { initCache } from './cache/index.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { capacityGuard, capacitySummary } from './middleware/capacity.js';
import { startCapacityMonitor, getCapacity, LEVEL } from './utils/capacity.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { setupSocket } from './socket/index.js';
import { setupSwagger } from './swagger.js';
import axios from "axios"
// Route'lar
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import staffRoutes from './routes/staff.routes.js';
import adminRoutes from './routes/admin.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import gamesRoutes from './routes/games.routes.js';
import friendsRoutes from './routes/friends.routes.js';
import userQuizzesRoutes from './routes/userQuizzes.routes.js';
import { initMongo, closeMongo } from './mongo/runtimeStore.js';

const app = express();
app.set('trust proxy', 1)
// ============ XAVFSIZLIK ============

// Strict CORS - faqat ruxsat etilgan originlar
app.use(
  cors({
    origin(origin, cb) {
      console.log('Request Origin:', origin);
      console.log('Allowed Origins:', env.corsOrigins);

      if (!origin) return cb(null, true);
      if (env.corsOrigins.includes(origin)) return cb(null, true);

      return cb(new Error('CORS_NOT_ALLOWED'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression()); // gzip - tezlik

// Umumiy rate limit (DDoS himoya)
app.use('/api', globalLimiter);

// Server sig'imi (RAM/CPU) qo'riqchisi:
// RAM to'lib qolganda yangi og'ir so'rovlar 503 SERVER_BUSY oladi —
// process OOM bilan crash bo'lmaydi, ishlayotgan sessiyalar saqlanadi.
startCapacityMonitor();
app.use('/api', capacityGuard());

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ============ STATIC ============

// Yuklangan fayllar
const uploadDir = path.join(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: false }));

// ============ ROUTES ============

app.get('/health', (req, res) => {
  const cap = getCapacity();
  // 503 — load balancer/monitoring uchun signal, lekin javob baribir to'liq
  res.status(cap.level === LEVEL.BUSY ? 503 : 200).json({
    ok: cap.level !== LEVEL.BUSY,
    uptime: process.uptime(),
    time: new Date().toISOString(),
    capacity: capacitySummary(),
  });
});

// Frontend shu endpoint orqali "server band" holatini biladi va
// o'yin tugmalarini o'chirib qo'yadi (client crash/timeout o'rniga aniq xabar).
app.get('/api/health', (req, res) => res.json({ success: true, data: capacitySummary() }));
app.use('/api/auth', authRoutes);
app.use('/api/user/friends', friendsRoutes);
app.use('/api/user/quizzes', userQuizzesRoutes);
app.use('/api/user', userRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/staff', adminRoutes);
app.use('/api/upload', capacityGuard({ heavy: true }), uploadRoutes);
app.use('/api', gamesRoutes);
const keepServerAlive = () => {
  if (!process.env.BASE_URL) {
    console.warn('⚠️ BASE_URL is not set. Skipping ping.')
    return
  }

  setInterval(() => {
    axios
      .get(`${process.env.BASE_URL}/health`)
      .then(() => console.log('🔄 Server active'))
      .catch(err => console.log('⚠️ Ping failed:', err.message))
  }, 10 * 60 * 1000)
}

keepServerAlive()
// Swagger hujjatlar (faqat production'da ham ochiq - dokumentatsiya uchun)
setupSwagger(app);

// ============ HANDLERS ============

app.use(notFoundHandler);
app.use(errorHandler);

// ============ SERVER ============

await initCache();
await initMongo();
const server = http.createServer(app);
await setupSocket(server, env.corsOrigins);

server.listen(env.port, '0.0.0.0', () => {
  console.log(`[xolt-games] Server ishga tushdi: http://0.0.0.0:${env.port}`);
  console.log(`[xolt-games] Swagger: http://localhost:${env.port}/api-docs`);
});

// ============ CRASH HIMOYASI ============
// Kutilmagan xato butun serverni (va HAMMA o'yinni) yiqitmasligi kerak.
// Log qilamiz va ishlashda davom etamiz; faqat tuzatib bo'lmaydigan
// holatlarda (masalan port band) chiqamiz.
process.on('uncaughtException', (err) => {
  console.error('[xolt-games] uncaughtException (server ishlashda davom etadi):', err?.stack || err);
  if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
    console.error('[xolt-games] Fatal: port ochilmadi — process to\'xtatilmoqda');
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[xolt-games] unhandledRejection (server ishlashda davom etadi):', reason?.stack || reason);
});

// Toza yopilish
const shutdown = async () => {
  console.log('[xolt-games] Serverni yopish...');
  await Promise.all([prisma.$disconnect(), closeMongo()]);
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
