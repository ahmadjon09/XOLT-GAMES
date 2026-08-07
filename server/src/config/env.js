// Atrof-muhit o'zgaruvchilari yagona joydan olinadi
import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'xolt-dev-secret-please-change',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 5),
  // imgbb.com API kaliti - bo'sh bo'lsa rasm lokalga saqlanadi
  imgbbApiKey: process.env.IMGBB_API_KEY || '',
};
