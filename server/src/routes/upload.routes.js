// Fayl yuklash route'i - profil avatar/cover, frame va savol rasmlari
// IMGBB_API_KEY o'rnatilgan bo'lsa -> imgbb.com ga yuklanadi (URL qaytariladi)
// Aks holda -> lokal /uploads papkasiga saqlanadi (dev rejim)
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ok, asyncH, ApiError } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { upload, ALLOWED_FOLDERS } from '../middleware/upload.js';
import { env } from '../config/env.js';
import { prisma } from '../prisma/client.js';

const router = Router();
const IMGBB_URL = 'https://api.imgbb.com/1/upload';

// ============ IMGBB GA YUKLASH ============
// Buffer ni imgbb API orqali yuboradi, bevosita URL qaytaradi
async function uploadToImgbb(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('key', env.imgbbApiKey);
  form.append('image', new Blob([buffer], { type: mimetype || 'image/png' }), filename || 'image.png');

  let res;
  try {
    res = await fetch(IMGBB_URL, { method: 'POST', body: form });
  } catch (e) {
    throw new ApiError(502, 'IMGBB_UNREACHABLE', 'Rasm xizmatiga ulanishda xatolik. Qayta urinib ko\'ring');
  }

  const data = await res.json().catch(() => null);
  if (!data || !data.success) {
    const msg = data?.error?.message || 'Noma\'lum xatolik';
    throw new ApiError(502, 'IMGBB_FAILED', `imgbb xatosi: ${msg}`);
  }

  // Bevosita rasm URL (cdn)
  return data.data.url || data.data.display_url;
}

// ============ LOKAL FALLBACK (dev rejim) ============
function saveLocal(buffer, folder, originalName) {
  const dir = path.join(process.cwd(), env.uploadDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(originalName || '').toLowerCase() || '.png';
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `/uploads/${folder}/${name}`;
}

// POST /api/upload - form-data: file + folder (avatars|covers|frames|questions|effects)
// Maksimal hajm: 5MB (env.MAX_UPLOAD_MB)
router.post(
  '/',
  requireAuth('any'),
  uploadLimiter,
  upload.single('file'),
  asyncH(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'NO_FILE', 'Fayl yuklanmadi');

    const folder = req.body.folder || 'avatars';
    if (!ALLOWED_FOLDERS.includes(folder)) {
      throw new ApiError(400, 'INVALID_FOLDER', 'Noto\'g\'ri papka');
    }
    if (folder === 'covers' && req.user.kind !== 'user') {
      throw new ApiError(403, 'AUTH_FORBIDDEN', 'Cover rasm faqat player profiliga qo\'shiladi');
    }

    // imgbb yoki lokal
    let url;
    let host = 'local';
    if (env.imgbbApiKey) {
      url = await uploadToImgbb(req.file.buffer, req.file.originalname, req.file.mimetype);
      host = 'imgbb';
    } else {
      url = saveLocal(req.file.buffer, folder, req.file.originalname);
    }

    // Profile media is persisted directly; cover images are player-only.
    if (folder === 'avatars') {
      const model = req.user.kind === 'staff' ? prisma.staff : prisma.user;
      await model.update({ where: { id: req.user.id }, data: { avatar: url } });
    }
    if (folder === 'covers') {
      await prisma.user.update({ where: { id: req.user.id }, data: { coverImage: url } });
    }

    return ok(res, { url, folder, filename: req.file.originalname || null, host });
  })
);

export default router;
