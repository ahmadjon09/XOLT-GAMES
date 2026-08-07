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

const app = express();

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

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ============ STATIC ============

// Yuklangan fayllar
const uploadDir = path.join(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: false }));

// ============ ROUTES ============

app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/staff', adminRoutes);
app.use('/api/upload', uploadRoutes);
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
const server = http.createServer(app);
setupSocket(server, env.corsOrigins);

server.listen(env.port, '0.0.0.0', () => {
  console.log(`[xolt-games] Server ishga tushdi: http://0.0.0.0:${env.port}`);
  console.log(`[xolt-games] Swagger: http://localhost:${env.port}/api-docs`);
});

// Toza yopilish
const shutdown = async () => {
  console.log('[xolt-games] Serverni yopish...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
