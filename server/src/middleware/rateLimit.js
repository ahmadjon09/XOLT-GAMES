// Rate limiting - DDoS va spammingdan himoya
import rateLimit from 'express-rate-limit';

// Umumiy: har IP dan 15 daqiqada 500 so'rov
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 800,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Juda ko\'p so\'rov yuborildi. Birozdan so\'ng urinib ko\'ring' } },
});

// Auth uchun qat'iyroq: har IP dan 15 daqiqada 20 urinish (brute-force himoyasi)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Juda ko\'p urinish. 15 daqiqa kuting' } },
});

// Yuklash (upload) uchun: har IP dan 10 daqiqada 30 ta fayl
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'UPLOAD_RATE_LIMITED', message: 'Juda ko\'p fayl yuklandi' } },
});
