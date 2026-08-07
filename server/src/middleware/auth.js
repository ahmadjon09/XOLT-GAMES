// Auth middleware - JWT token tekshiradi va foydalanuvchini req.user ga yuklaydi
import { ApiError, asyncH } from '../utils/response.js';
import { verifyToken } from '../utils/security.js';
import { prisma } from '../prisma/client.js';

// Token header'dan olinadi: Authorization: Bearer <token>
const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
};

// kind: 'user' | 'staff' | 'any' - kim kirishi mumkin
// roles: ruxsat etilgan rollar (staff uchun), masalan ['ADMIN']
export const requireAuth = (kind = 'any', roles = null) =>
  asyncH(async (req, res, next) => {
    const token = extractToken(req);
    if (!token) throw new ApiError(401, 'AUTH_TOKEN_MISSING', 'Token topilmadi');

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      throw new ApiError(401, 'AUTH_INVALID_TOKEN', 'Token yaroqsiz yoki muddati tugagan');
    }

    if (kind !== 'any' && decoded.kind !== kind) {
      throw new ApiError(403, 'AUTH_WRONG_ENTITY', 'Bu kirish uchun ruxsat yoq');
    }

    // DB dan yangi holatini olamiz (o'chirilgan yoki bloklangan bo'lishi mumkin)
    let db = null;
    if (decoded.kind === 'staff') {
      db = await prisma.staff.findUnique({ where: { id: decoded.id } });
      if (!db) throw new ApiError(401, 'AUTH_USER_NOT_FOUND', 'Foydalanuvchi topilmadi');
      if (!db.active) throw new ApiError(403, 'AUTH_USER_DISABLED', 'Hisob faolshtirilgan');
      if (roles && !roles.includes(db.role)) {
        throw new ApiError(403, 'AUTH_FORBIDDEN', 'Bu amal uchun ruxsat yoq');
      }
    } else if (decoded.kind === 'user') {
      db = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!db) throw new ApiError(401, 'AUTH_USER_NOT_FOUND', 'Foydalanuvchi topilmadi');
    } else {
      throw new ApiError(401, 'AUTH_INVALID_TOKEN', 'Token yaroqsiz');
    }

    req.user = {
      id: db.id,
      kind: decoded.kind,
      role: decoded.kind === 'staff' ? db.role : 'STUDENT',
      full_name: db.full_name,
      db,
    };
    next();
  });
