// Markaziy xato handler - hamma xatolar shu yerdan o'tadi
import { ZodError } from 'zod';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  // Business xato
  if (err.status && err.code) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
  }

  // Zod validatsiya xatosi
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: first?.message || 'Ma\'lumot noto\'g\'ri', field: first?.path?.join('.') },
    });
  }

  // Multer xatolari
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `Fayl hajmi ${env.maxUploadMb}MB dan oshmasligi kerak` : 'Fayl yuklashda xatolik';
    return res.status(400).json({ success: false, error: { code: err.code, message: msg } });
  }
  if (err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Faqat rasm fayllari ruxsat etiladi (png, jpg, webp)' } });
  }
  if (err.message === 'INVALID_FOLDER') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_FOLDER', message: 'Noto\'g\'ri papka' } });
  }

  // Prisma: unikal cheklov buzilgan (P2002)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_ERROR', message: `Bu qiymat allaqachon mavjud: ${target}` },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ma\'lumot topilmadi' } });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ success: false, error: { code: 'RELATION_ERROR', message: 'Bog\'liq ma\'lumot noto\'g\'ri' } });
    }
  }

  // Noma'lum xato - log qilamiz
  console.error('[server-error]', err);
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Serverda xatolik yuz berdi' } });
};

// 404 handler
export const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route topilmadi: ${req.method} ${req.path}` } });
};
