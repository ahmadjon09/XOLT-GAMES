// Fayl yuklash (multer) - xotiraga (buffer) saqlanadi, keyin imgbb yoki lokalga yuboriladi
// Hajm chegarasi: 5MB (env.MAX_UPLOAD_MB)
import multer from 'multer';
import { env } from '../config/env.js';

// Ruxsat etilgan papkalar - tashqariga chiqishning oldini olamiz
export const ALLOWED_FOLDERS = ['avatars', 'frames', 'questions', 'effects', 'quizzes'];
export const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'];

export const upload = multer({
  // Buffer saqlash - imgbb'ga yuborish uchun
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});
