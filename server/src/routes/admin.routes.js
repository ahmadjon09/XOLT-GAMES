// Admin route'lari - o'quvchilar, xodimlar, shop buyumlari, statistika, coding savollar
import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword } from '../utils/security.js';
import { normalizePhone } from '../utils/helpers.js';
import { paymentView } from '../utils/payments.js';
import { prisma } from '../prisma/client.js';
import { cacheGet, cacheSet, cacheDelPrefix } from '../cache/index.js';

const router = Router();
router.use(requireAuth('staff'));

// ============ O'QUVCHILAR (admin va cashier yaratadi) ============

// GET /api/staff/users?search&groupId&page&limit
router.get(
  '/users',
  asyncH(async (req, res) => {
    const search = String(req.query.search || '');
    const groupId = String(req.query.groupId || '');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

    const where = {
      ...(search
        ? { OR: [{ full_name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }, { username: { contains: search, mode: 'insensitive' } }] }
        : {}),
      ...(groupId ? { groupMembers: { some: { groupId } } } : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          currentFrame: true,
          currentEffect: true,
          groupMembers: { include: { group: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return ok(
      res,
      users.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        avatar: u.avatar,
        phone: u.phone,
        username: u.username,
        coin: u.coin,
        score: u.score,
        currentFrame: u.currentFrame,
        currentEffect: u.currentEffect,
        groups: u.groupMembers.map((gm) => ({ id: gm.group.id, name: gm.group.name })),
        createdAt: u.createdAt,
      })),
      { total, page, limit }
    );
  })
);

// POST /api/staff/users - o'quvchi yaratish (admin yoki cashier)
router.post(
  '/users',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'CASHIER', 'TEACHER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');

    const schema = z.object({
      full_name: z.string().min(3, 'Ism kamida 3 belgi').max(60),
      phone: z.string().min(7, 'Telefon kiriting'),
      password: z.string().min(4, 'Parol kamida 4 belgi').max(50),
      username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional().nullable(),
      groupIds: z.array(z.string()).max(10).optional(),
    });
    const data = schema.parse(req.body);

    const phone = normalizePhone(data.phone);
    if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Telefon noto\'g\'ri');

    const exists = await prisma.user.findUnique({ where: { phone } });
    if (exists) throw new ApiError(409, 'PHONE_EXISTS', 'Bu telefon allaqachon ro\'yxatdan o\'tgan');

    // O'qituvchi faqat o'z guruhlariga qo'sha oladi
    let groupIds = data.groupIds || [];
    if (req.user.role === 'TEACHER') {
      const mine = await prisma.group.findMany({ where: { teacherId: req.user.id }, select: { id: true } });
      const mineIds = new Set(mine.map((g) => g.id));
      groupIds = groupIds.filter((id) => mineIds.has(id));
    }

    const user = await prisma.user.create({
      data: {
        full_name: data.full_name,
        phone,
        password: await hashPassword(data.password),
        username: data.username || null,
        createdById: req.user.id,
        groupMembers: { create: groupIds.map((groupId) => ({ groupId })) },
      },
      include: { groupMembers: { include: { group: true } } },
    });

    return ok(res, { id: user.id, full_name: user.full_name, phone: user.phone, groups: user.groupMembers.map((gm) => gm.group.name) }, { message: 'O\'quvchi yaratildi' });
  })
);

// GET /api/staff/users/:id - bitta o'quvchining to'liq ma'lumotlari
// Profil, guruhlar, davomat tarixi, to'lov tarixi, yutilgan o'yinlar, reyting o'rni
router.get(
  '/users/:id',
  asyncH(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        currentFrame: true,
        currentEffect: true,
        groupMembers: { include: { group: { include: { teacher: true } } } },
      },
    });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'O\'quvchi topilmadi');

    // Teacher faqat o'z guruhlaridagi o'quvchilarni ko'ra oladi
    if (req.user.role === 'TEACHER') {
      const myGroups = await prisma.group.findMany({ where: { teacherId: req.user.id }, select: { id: true } });
      const myIds = new Set(myGroups.map((g) => g.id));
      if (!user.groupMembers.some((gm) => myIds.has(gm.groupId))) {
        throw new ApiError(403, 'AUTH_FORBIDDEN', 'Bu o\'quvchi sizning guruhlaringizda emas');
      }
    }

    const groupIds = user.groupMembers.map((gm) => gm.groupId);
    const [attendance, payments, games, rank] = await Promise.all([
      prisma.attendance.findMany({ where: { userId: user.id, groupId: { in: groupIds } }, orderBy: { date: 'desc' }, take: 60 }),
      prisma.payment.findMany({ where: { userId: user.id, groupId: { in: groupIds } }, orderBy: [{ month: 'desc' }] }),
      prisma.gameRecord.findMany({ where: { winnerId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.user.count({ where: { score: { gt: user.score } } }),
    ]);

    const groupName = new Map(user.groupMembers.map((gm) => [gm.groupId, gm.group.name]));

    return ok(res, {
      id: user.id,
      full_name: user.full_name,
      avatar: user.avatar,
      phone: user.phone,
      username: user.username,
      coin: user.coin,
      score: user.score,
      week_score: user.week_score,
      month_score: user.month_score,
      rank: rank + 1,
      currentFrame: user.currentFrame,
      currentEffect: user.currentEffect,
      createdAt: user.createdAt,
      groups: user.groupMembers.map((gm) => {
        const gAtt = attendance.filter((a) => a.groupId === gm.groupId);
        const gPay = payments.filter((p) => p.groupId === gm.groupId);
        return {
          id: gm.group.id,
          name: gm.group.name,
          teacher: gm.group.teacher ? gm.group.teacher.full_name : null,
          joinedAt: gm.joinedAt,
          attendance: {
            present: gAtt.filter((a) => a.status === 'present').length,
            absent: gAtt.filter((a) => a.status === 'absent').length,
            late: gAtt.filter((a) => a.status === 'late').length,
            marked: gAtt.length,
          },
          payments: gPay.map((p) => ({ id: p.id, month: p.month, amount: p.amount, status: p.status, paidAt: p.paidAt })),
        };
      }),
      attendance: attendance.slice(0, 40).map((a) => ({
        id: a.id,
        date: a.date,
        status: a.status,
        note: a.note,
        groupName: groupName.get(a.groupId) || null,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        month: p.month,
        amount: p.amount,
        status: p.status,
        paidAt: p.paidAt,
        groupName: groupName.get(p.groupId) || null,
      })),
      games: games.map((g) => ({
        id: g.id,
        type: g.type,
        roomCode: g.roomCode,
        totalBets: g.totalBets,
        commission: g.commission,
        totalPlayers: g.totalPlayers,
        createdAt: g.createdAt,
      })),
    });
  })
);

// PATCH /api/staff/users/:id - yangilash (guruhlar almashadi)
router.patch(
  '/users/:id',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'CASHIER', 'TEACHER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');

    const schema = z.object({
      full_name: z.string().min(3).max(60).optional(),
      username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional().nullable(),
      password: z.string().min(4).max(50).optional(),
      groupIds: z.array(z.string()).max(10).optional(),
    });
    const data = schema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { groupMembers: true } });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'O\'quvchi topilmadi');

    const update = {};
    if (data.full_name) update.full_name = data.full_name;
    if (data.username !== undefined) update.username = data.username;
    if (data.password) update.password = await hashPassword(data.password);

    if (data.groupIds) {
      let groupIds = data.groupIds;
      if (req.user.role === 'TEACHER') {
        const mine = await prisma.group.findMany({ where: { teacherId: req.user.id }, select: { id: true } });
        const mineIds = new Set(mine.map((g) => g.id));
        groupIds = groupIds.filter((id) => mineIds.has(id));
      }
      await prisma.groupMember.deleteMany({ where: { userId: user.id } });
      await prisma.groupMember.createMany({
        data: groupIds.map((groupId) => ({ userId: user.id, groupId })),
        skipDuplicates: true,
      });
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data: update });
    return ok(res, { id: updated.id, message: 'O\'quvchi yangilandi' });
  })
);

// DELETE /api/staff/users/:id - faqat admin
router.delete(
  '/users/:id',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin o\'chira oladi');
    await prisma.user.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'O\'quvchi o\'chirildi' });
  })
);

// ============ XODIMLAR (faqat admin) ============

// GET /api/staff/staff
router.get(
  '/staff',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const staff = await prisma.staff.findMany({
      include: { _count: { select: { groups: true, quizzes: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(
      res,
      staff.map((s) => ({
        id: s.id,
        full_name: s.full_name,
        phone: s.phone,
        avatar: s.avatar,
        role: s.role,
        active: s.active,
        groupsCount: s._count.groups,
        quizzesCount: s._count.quizzes,
        createdAt: s.createdAt,
      }))
    );
  })
);

// POST /api/staff/staff - xodim yaratish
router.post(
  '/staff',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      full_name: z.string().min(3).max(60),
      phone: z.string().min(7),
      password: z.string().min(4).max(50),
      role: z.enum(['TEACHER', 'CASHIER', 'ADMIN']),
    });
    const data = schema.parse(req.body);

    const phone = normalizePhone(data.phone);
    if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Telefon noto\'g\'ri');

    const exists = await prisma.staff.findUnique({ where: { phone } });
    if (exists) throw new ApiError(409, 'PHONE_EXISTS', 'Bu telefon allaqachon ro\'yxatdan o\'tgan');

    const staff = await prisma.staff.create({
      data: {
        full_name: data.full_name,
        phone,
        password: await hashPassword(data.password),
        role: data.role,
        createdById: req.user.id,
      },
    });
    return ok(res, { id: staff.id, role: staff.role }, { message: 'Xodim yaratildi' });
  })
);

// PATCH /api/staff/staff/:id
router.patch(
  '/staff/:id',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      full_name: z.string().min(3).max(60).optional(),
      password: z.string().min(4).max(50).optional(),
      role: z.enum(['TEACHER', 'CASHIER', 'ADMIN']).optional(),
      active: z.boolean().optional(),
    });
    const data = schema.parse(req.body);

    const staff = await prisma.staff.findUnique({ where: { id: req.params.id } });
    if (!staff) throw new ApiError(404, 'NOT_FOUND', 'Xodim topilmadi');

    // Boshqa adminni tahrirlash mumkin emas — admin faqat o'zini "Mening profilim"dan o'zgartiradi
    if (staff.role === 'ADMIN' && staff.id !== req.user.id) {
      throw new ApiError(403, 'ADMIN_LOCKED', 'Boshqa adminni tahrirlash mumkin emas');
    }

    // O'zini o'zi faolshtira olmaydi
    if (data.active === false && staff.id === req.user.id) {
      throw new ApiError(400, 'CANNOT_DISABLE_SELF', 'O\'zingizni faolshtira olmaysiz');
    }

    const update = {};
    if (data.full_name) update.full_name = data.full_name;
    if (data.password) update.password = await hashPassword(data.password);
    if (data.role) update.role = data.role;
    if (data.active !== undefined) update.active = data.active;

    const updated = await prisma.staff.update({ where: { id: staff.id }, data: update });
    return ok(res, { id: updated.id, message: 'Xodim yangilandi' });
  })
);

// DELETE /api/staff/staff/:id
router.delete(
  '/staff/:id',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    if (req.params.id === req.user.id) throw new ApiError(400, 'CANNOT_DELETE_SELF', 'O\'zingizni o\'chira olmaysiz');
    const target = await prisma.staff.findUnique({ where: { id: req.params.id } });
    if (target && target.role === 'ADMIN') {
      throw new ApiError(403, 'ADMIN_LOCKED', 'Adminni o\'chirish mumkin emas');
    }
    await prisma.staff.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Xodim o\'chirildi' });
  })
);

// ============ SHOP BOSHQARUVI (faqat admin) ============

// GET /api/staff/shop - barcha buyumlar (aktiv va aktiv emas)
router.get(
  '/shop',
  asyncH(async (req, res) => {
    const [frames, effects] = await Promise.all([
      prisma.frame.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { users: true } } },
      }),
      prisma.effect.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { users: true } } },
      }),
    ]);
    return ok(res, {
      frames: frames.map((f) => ({ ...f, usersCount: f._count.users, _count: undefined })),
      effects: effects.map((e) => ({ ...e, usersCount: e._count.users, _count: undefined })),
    });
  })
);

// POST /api/staff/shop/frames
router.post(
  '/shop/frames',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      id: z.string().min(1).max(40).optional(),
      name: z.string().min(1).max(60),
      description: z.string().max(200).optional().nullable(),
      image: z.string().max(500).optional().nullable(),
      rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
      price: z.number().int().min(0),
      animation: z.string().max(200).optional().nullable(),
      sortOrder: z.number().int().min(0).optional(),
    });
    const data = schema.parse(req.body);

    const id = data.id || `frame_${Date.now()}`;
    const frame = await prisma.frame.create({
      data: {
        id,
        name: data.name,
        description: data.description || null,
        image: data.image || null,
        rarity: data.rarity || 'common',
        price: data.price,
        animation: data.animation || null,
        sortOrder: data.sortOrder || 0,
      },
    });
    return ok(res, frame, { message: 'Frame yaratildi' });
  })
);

// PATCH /api/staff/shop/frames/:id
router.patch(
  '/shop/frames/:id',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      name: z.string().min(1).max(60).optional(),
      description: z.string().max(200).optional().nullable(),
      image: z.string().max(500).optional().nullable(),
      rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
      price: z.number().int().min(0).optional(),
      animation: z.string().max(200).optional().nullable(),
      active: z.boolean().optional(),
      sortOrder: z.number().int().min(0).optional(),
    });
    const data = schema.parse(req.body);
    const frame = await prisma.frame.update({ where: { id: req.params.id }, data });
    return ok(res, frame, { message: 'Frame yangilandi' });
  })
);

// DELETE /api/staff/shop/frames/:id
router.delete(
  '/shop/frames/:id',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    await prisma.frame.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Frame o\'chirildi' });
  })
);

// POST /api/staff/shop/effects
router.post(
  '/shop/effects',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      id: z.string().min(1).max(40).optional(),
      name: z.string().min(1).max(60),
      description: z.string().max(200).optional().nullable(),
      type: z.string().min(1).max(40),
      price: z.number().int().min(0),
      config: z.record(z.any()).optional(),
      sortOrder: z.number().int().min(0).optional(),
    });
    const data = schema.parse(req.body);

    const id = data.id || `effect_${Date.now()}`;
    const effect = await prisma.effect.create({
      data: {
        id,
        name: data.name,
        description: data.description || null,
        type: data.type,
        price: data.price,
        config: data.config || {},
        sortOrder: data.sortOrder || 0,
      },
    });
    return ok(res, effect, { message: 'Effect yaratildi' });
  })
);

// PATCH /api/staff/shop/effects/:id
router.patch(
  '/shop/effects/:id',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      name: z.string().min(1).max(60).optional(),
      description: z.string().max(200).optional().nullable(),
      type: z.string().min(1).max(40).optional(),
      price: z.number().int().min(0).optional(),
      config: z.record(z.any()).optional(),
      active: z.boolean().optional(),
      sortOrder: z.number().int().min(0).optional(),
    });
    const data = schema.parse(req.body);
    const effect = await prisma.effect.update({ where: { id: req.params.id }, data });
    return ok(res, effect, { message: 'Effect yangilandi' });
  })
);

// DELETE /api/staff/shop/effects/:id
router.delete(
  '/shop/effects/:id',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    await prisma.effect.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Effect o\'chirildi' });
  })
);

// ============ STATISTIKA (faqat admin) ============

// GET /api/staff/stats/overview (Redis cache 60s)
router.get(
  '/stats/overview',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const cached = await cacheGet('xolt:stats:overview');
    if (cached) return ok(res, cached);

    const [usersCount, staffCount, groupsCount, quizzesCount, questionsCount, paymentsAgg, coinAgg, gamesAgg] = await Promise.all([
      prisma.user.count(),
      prisma.staff.count(),
      prisma.group.count(),
      prisma.quiz.count(),
      prisma.question.count(),
      prisma.payment.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.user.aggregate({ _sum: { coin: true } }),
      prisma.gameRecord.count(),
    ]);

    const paidSum = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'paid' },
    });

    const data = {
      usersCount,
      staffCount,
      groupsCount,
      quizzesCount,
      questionsCount,
      paymentsCount: paymentsAgg._count,
      paymentsSum: paymentsAgg._sum.amount || 0,
      paidPaymentsSum: paidSum._sum.amount || 0,
      coinsInCirculation: coinAgg._sum.coin || 0,
      gamesCount: gamesAgg,
      activeToday: await prisma.user.count({ where: { updatedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    };
    await cacheSet('xolt:stats:overview', data, 60);
    return ok(res, data);
  })
);

// GET /api/staff/stats/charts?days=30
router.get(
  '/stats/charts',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));

    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const [users, games, payments, topUsers, roleStaff] = await Promise.all([
      prisma.user.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
      prisma.gameRecord.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true, type: true } }),
      prisma.payment.findMany({ where: { paidAt: { gte: from } }, select: { paidAt: true, amount: true } }),
      prisma.user.findMany({ orderBy: { score: 'desc' }, take: 10, select: { id: true, full_name: true, score: true, avatar: true, currentFrame: true } }),
      prisma.staff.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);

    // Kunlar bo'yicha ro'yxatga olishlar
    const registrations = [];
    const gamesByDay = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      registrations.push({
        date: key,
        count: users.filter((u) => u.createdAt >= d && u.createdAt < next).length,
      });
      const dayGames = games.filter((g) => g.createdAt >= d && g.createdAt < next);
      gamesByDay.push({
        date: key,
        math: dayGames.filter((g) => g.type === 'math').length,
        quiz: dayGames.filter((g) => g.type === 'quiz').length,
        tictactoe: dayGames.filter((g) => g.type === 'tictactoe').length,
      });
    }

    // Oy bo'yicha to'lovlar (oxirgi 6 oy)
    const paymentsByMonth = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const fromM = new Date(d.getFullYear(), d.getMonth(), 1);
      const toM = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthPayments = payments.filter((p) => p.paidAt >= fromM && p.paidAt < toM);
      paymentsByMonth.push({
        month: key,
        amount: monthPayments.reduce((s, p) => s + p.amount, 0),
        count: monthPayments.length,
      });
    }

    return ok(res, {
      registrations,
      gamesByDay,
      paymentsByMonth,
      topUsers,
      roleStaff: roleStaff.map((r) => ({ role: r.role, count: r._count._all })),
    });
  })
);

// ============ CODING SAVOLLAR ============

// GET /api/staff/coding-questions
router.get(
  '/coding-questions',
  asyncH(async (req, res) => {
    const questions = await prisma.codingQuestion.findMany({
      select: { id: true, title: true, difficulty: true, coin: true, timeLimit: true, memoryLimit: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, questions);
  })
);

// POST /api/staff/coding-questions
router.post(
  '/coding-questions',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'TEACHER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
    const schema = z.object({
      title: z.string().min(2).max(120),
      question_uz: z.string().min(5),
      question_ru: z.string().min(5),
      difficulty: z.enum(['easy', 'normal', 'hard', 'very_hard']).optional(),
      coin: z.number().int().min(1).max(1000).optional(),
      timeLimit: z.number().int().min(100).max(60000).optional(),
      memoryLimit: z.number().int().min(16).max(1024).optional(),
      main: z.record(z.any()),
      tests: z.array(z.record(z.any())),
      starterCode: z.record(z.any()).optional().nullable(),
      solution: z.record(z.any()).optional().nullable(),
    });
    const data = schema.parse(req.body);

    const q = await prisma.codingQuestion.create({
      data: {
        title: data.title,
        question_uz: data.question_uz,
        question_ru: data.question_ru,
        difficulty: data.difficulty || 'easy',
        coin: data.coin || 10,
        timeLimit: data.timeLimit || 1000,
        memoryLimit: data.memoryLimit || 128,
        main: data.main,
        tests: data.tests,
        starterCode: data.starterCode || null,
        solution: data.solution || null,
      },
    });
    return ok(res, q, { message: 'Savol yaratildi' });
  })
);

// PATCH /api/staff/coding-questions/:id
router.patch(
  '/coding-questions/:id',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'TEACHER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
    const q = await prisma.codingQuestion.update({ where: { id: req.params.id }, data: req.body });
    return ok(res, q, { message: 'Savol yangilandi' });
  })
);

// DELETE /api/staff/coding-questions/:id
router.delete(
  '/coding-questions/:id',
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    await prisma.codingQuestion.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Savol o\'chirildi' });
  })
);

export default router;
