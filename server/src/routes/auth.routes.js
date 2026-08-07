// Auth route'lari - telefon raqam + parol orqali kirish (email ishlatilmaydi)
import { Router } from 'express';
import { z } from 'zod';
import { ok, fail, ApiError, asyncH } from '../utils/response.js';
import { hashPassword, comparePassword, signToken } from '../utils/security.js';
import { normalizePhone } from '../utils/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { prisma } from '../prisma/client.js';

const router = Router();

// Profil ma'lumotlarini to'liq qaytarish (o'quvchi uchun)
const userProfile = (u) => ({
  id: u.id,
  kind: 'user',
  full_name: u.full_name,
  avatar: u.avatar,
  phone: u.phone,
  username: u.username,
  coin: u.coin,
  score: u.score,
  week_score: u.week_score,
  month_score: u.month_score,
  currentFrame: u.currentFrame,
  currentEffect: u.currentEffect,
  groups: (u.groupMembers || []).map((gm) => ({
    id: gm.group.id,
    name: gm.group.name,
    teacher: gm.group.teacher ? { id: gm.group.teacher.id, full_name: gm.group.teacher.full_name } : null,
  })),
  createdAt: u.createdAt,
});

// Profil ma'lumotlarini qaytarish (xodim uchun)
const staffProfile = (s, extra = {}) => ({
  id: s.id,
  kind: 'staff',
  full_name: s.full_name,
  avatar: s.avatar,
  phone: s.phone,
  role: s.role,
  ...extra,
  createdAt: s.createdAt,
});


// POST /api/auth/register - o'quvchi o'zi ro'yxatdan o'tishi (guruhsiz, coin 0)
router.post(
  '/register',
  authLimiter,
  asyncH(async (req, res) => {
    const schema = z.object({
      full_name: z.string().min(3, 'Ism kamida 3 belgi').max(60),
      phone: z.string().min(7, 'Telefon kiriting'),
      password: z.string().min(4, 'Parol kamida 4 belgi').max(50),
      username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username faqat harf, raqam va _').optional().nullable(),
    });
    const data = schema.parse(req.body);

    const phone = normalizePhone(data.phone);
    if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Telefon noto\'g\'ri');

    const exists = await prisma.user.findUnique({ where: { phone } });
    if (exists) throw new ApiError(409, 'PHONE_EXISTS', 'Bu telefon allaqachon ro\'yxatdan o\'tgan');
    if (data.username) {
      const uname = await prisma.user.findUnique({ where: { username: data.username } });
      if (uname) throw new ApiError(409, 'USERNAME_TAKEN', 'Bu username band');
    }

    const user = await prisma.user.create({
      data: {
        full_name: data.full_name,
        phone,
        username: data.username || null,
        password: await hashPassword(data.password),
      },
    });

    const token = signToken({ id: user.id, kind: 'user', full_name: user.full_name });
    return ok(res, { token, profile: userProfile(user) }, { message: 'Ro\'yxatdan o\'tildi' });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  asyncH(async (req, res) => {
    const schema = z.object({
      phone: z.string().min(7, 'Telefon raqam kiriting'),
      password: z.string().min(4, 'Parol kamida 4 belgi'),
    });
    const { phone, password } = schema.parse(req.body);

    const normalized = normalizePhone(phone);
    if (!normalized) throw new ApiError(400, 'INVALID_PHONE', 'Telefon raqam noto\'g\'ri formatda');

    // Avval xodimlar orasidan qidiramiz (teacher/cashier/admin)
    const staff = await prisma.staff.findUnique({ where: { phone: normalized } });
    if (staff) {
      const match = await comparePassword(password, staff.password);
      if (!match) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Telefon yoki parol noto\'g\'ri');
      if (!staff.active) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Hisob faolshtirilgan. Admin bilan bog\'laning');

      const token = signToken({ id: staff.id, kind: 'staff', role: staff.role, full_name: staff.full_name });
      const [groupsCount, quizzesCount] = await Promise.all([
        prisma.group.count({ where: { teacherId: staff.id } }),
        prisma.quiz.count({ where: { createdById: staff.id } }),
      ]);
      return ok(res, { token, profile: staffProfile(staff, { groupsCount, quizzesCount }) });
    }

    // Keyin o'quvchilar orasidan
    const user = await prisma.user.findUnique({
      where: { phone: normalized },
      include: {
        currentFrame: true,
        currentEffect: true,
        groupMembers: { include: { group: { include: { teacher: true } } } },
      },
    });
    if (!user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Telefon yoki parol noto\'g\'ri');

    const match = await comparePassword(password, user.password);
    if (!match) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Telefon yoki parol noto\'g\'ri');

    const token = signToken({ id: user.id, kind: 'user', full_name: user.full_name });
    return ok(res, { token, profile: userProfile(user) });
  })
);

// GET /api/auth/me - joriy foydalanuvchi
router.get(
  '/me',
  requireAuth('any'),
  asyncH(async (req, res) => {
    const { kind, id } = req.user;
    if (kind === 'staff') {
      const s = await prisma.staff.findUnique({ where: { id } });
      const [groupsCount, quizzesCount] = await Promise.all([
        prisma.group.count({ where: { teacherId: id } }),
        prisma.quiz.count({ where: { createdById: id } }),
      ]);
      return ok(res, staffProfile(s, { groupsCount, quizzesCount }));
    }
    const u = await prisma.user.findUnique({
      where: { id },
      include: {
        currentFrame: true,
        currentEffect: true,
        groupMembers: { include: { group: { include: { teacher: true } } } },
      },
    });
    return ok(res, userProfile(u));
  })
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  requireAuth('any'),
  asyncH(async (req, res) => {
    const schema = z.object({
      oldPassword: z.string().min(4),
      newPassword: z.string().min(4, 'Yangi parol kamida 4 belgi'),
    });
    const { oldPassword, newPassword } = schema.parse(req.body);

    const model = req.user.kind === 'staff' ? prisma.staff : prisma.user;
    const record = await model.findUnique({ where: { id: req.user.id } });
    if (!record) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');

    const match = await comparePassword(oldPassword, record.password);
    if (!match) throw new ApiError(400, 'WRONG_PASSWORD', 'Eski parol noto\'g\'ri');

    await model.update({ where: { id: req.user.id }, data: { password: await hashPassword(newPassword) } });
    return ok(res, { message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  })
);

export default router;
