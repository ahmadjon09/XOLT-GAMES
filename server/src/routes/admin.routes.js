// Admin-only management routes for players, games, shop, stats, and game content
import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { cacheGet, cacheSet, cacheDelPrefix } from '../cache/index.js';
import { getGameCatalog, invalidateGameCatalog } from '../services/gameCatalog.js';

const router = Router();
router.use(requireAuth('staff'));

// ============ PUBLIC PLAYERS ============

// GET /api/staff/users?search&page&limit
router.get('/users', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
  const search = String(req.query.search || '').trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
  const where = search ? {
    OR: [
      { full_name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ],
  } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, full_name: true, avatar: true, email: true, phone: true, username: true,
        coin: true, score: true, currentFrame: true, currentEffect: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return ok(res, users, { total, page, limit });
}));

// Player accounts must be created through Google/GitHub OAuth, not by staff with a phone/password.
router.post('/users', asyncH(async (_req, _res) => {
  throw new ApiError(410, 'OAUTH_REQUIRED', 'Foydalanuvchi Google yoki GitHub orqali ro\'yxatdan o\'tishi kerak');
}));

router.get('/users/:id', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { currentFrame: true, currentEffect: true },
  });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
  const [games, rank] = await Promise.all([
    prisma.gameRecord.findMany({ where: { winnerId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.user.count({ where: { score: { gt: user.score } } }),
  ]);
  return ok(res, {
    id: user.id,
    full_name: user.full_name,
    avatar: user.avatar,
    email: user.email,
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
    games: games.map((game) => ({
      id: game.id,
      type: game.type,
      roomCode: game.roomCode,
      totalBets: game.totalBets,
      commission: game.commission,
      totalPlayers: game.totalPlayers,
      createdAt: game.createdAt,
    })),
  });
}));

// Coin adjustment is an admin-only moderation tool.
router.get('/users/:id/coins', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, coin: true } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
  const rows = await prisma.coinTransaction.findMany({
    where: { userId: user.id },
    include: { staff: { select: { id: true, full_name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return ok(res, rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    balance: row.balance,
    note: row.note,
    staffName: row.staff?.full_name || null,
    staffRole: row.staff?.role || null,
    createdAt: row.createdAt,
  })), { coin: user.coin });
}));

router.post('/users/:id/coins', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
  const data = z.object({
    amount: z.number().int('Coin butun son bo\'lishi kerak').min(-100000).max(100000),
    note: z.string().max(200).optional().nullable(),
  }).parse(req.body);
  if (!data.amount) throw new ApiError(400, 'VALIDATION_ERROR', 'Miqdor 0 dan farqli bo\'lishi kerak');
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, coin: true } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
  const after = Math.max(0, user.coin + data.amount);
  const delta = after - user.coin;
  const [transaction] = await prisma.$transaction([
    prisma.coinTransaction.create({
      data: { userId: user.id, amount: delta, balance: after, note: data.note || null, staffId: req.user.id },
    }),
    prisma.user.update({ where: { id: user.id }, data: { coin: after } }),
  ]);
  await cacheDelPrefix('xolt:stats');
  return ok(res, { id: transaction.id, coin: after, delta }, { message: delta >= 0 ? 'Coin qo\'shildi' : 'Coin olindi' });
}));

router.patch('/users/:id', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
  const data = z.object({
    full_name: z.string().trim().min(3).max(60).optional(),
    username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional().nullable(),
  }).parse(req.body);
  if (data.full_name === undefined && data.username === undefined) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Yangilash uchun maydon ko\'rsating');
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
  await prisma.user.update({ where: { id: user.id }, data });
  return ok(res, { id: user.id, message: 'Profil yangilandi' });
}));

router.delete('/users/:id', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin o\'chira oladi');
  await prisma.user.delete({ where: { id: req.params.id } });
  return ok(res, { message: 'Foydalanuvchi o\'chirildi' });
}));

// ============ O'YINLAR BOSHQARUVI (faqat admin) ============

router.get('/games', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin o\'yinlarni boshqarishi mumkin');
  return ok(res, await getGameCatalog({ refresh: true }));
}));

router.patch('/games/:id', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin o\'yinlarni boshqarishi mumkin');
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const known = await getGameCatalog({ refresh: true });
  if (!known.some((game) => game.id === req.params.id)) throw new ApiError(404, 'NOT_FOUND', 'O\'yin topilmadi');
  const game = await prisma.gameCatalog.update({ where: { id: req.params.id }, data: { active } });
  await invalidateGameCatalog();
  return ok(res, game, { message: 'O\'yin holati yangilandi' });
}));

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

// ============ STATISTICS (admin only) ============

router.get('/stats/overview', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
  const cacheKey = 'xolt:stats:overview:v2';
  const cached = await cacheGet(cacheKey);
  if (cached) return ok(res, cached);

  const [usersCount, staffCount, quizzesCount, questionsCount, coinAgg, gamesCount, activeGames] = await Promise.all([
    prisma.user.count(),
    prisma.staff.count(),
    prisma.quiz.count(),
    prisma.question.count(),
    prisma.user.aggregate({ _sum: { coin: true } }),
    prisma.gameRecord.count(),
    getGameCatalog({ includeInactive: false }),
  ]);
  const data = {
    usersCount,
    staffCount,
    quizzesCount,
    questionsCount,
    coinsInCirculation: coinAgg._sum.coin || 0,
    gamesCount,
    activeGamesCount: activeGames.length,
    activeToday: await prisma.user.count({ where: { updatedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
  };
  await cacheSet(cacheKey, data, 60);
  return ok(res, data);
}));

router.get('/stats/charts', asyncH(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
  const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const [users, games, topUsers, roleStaff] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.gameRecord.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true, type: true } }),
    prisma.user.findMany({ orderBy: { score: 'desc' }, take: 10, select: { id: true, full_name: true, score: true, avatar: true, currentFrame: true } }),
    prisma.staff.groupBy({ by: ['role'], _count: { _all: true } }),
  ]);

  const registrations = [];
  const gamesByDay = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    registrations.push({ date: key, count: users.filter((user) => user.createdAt >= date && user.createdAt < next).length });
    const dayGames = games.filter((game) => game.createdAt >= date && game.createdAt < next);
    gamesByDay.push({
      date: key,
      math: dayGames.filter((game) => game.type === 'math').length,
      quiz: dayGames.filter((game) => game.type === 'quiz').length,
      tictactoe: dayGames.filter((game) => game.type === 'tictactoe').length,
    });
  }

  return ok(res, {
    registrations,
    gamesByDay,
    topUsers,
    roleStaff: roleStaff.map((row) => ({ role: row.role, count: row._count._all })),
  });
}));

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
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
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
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
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
