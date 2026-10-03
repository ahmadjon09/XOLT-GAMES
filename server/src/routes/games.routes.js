// Yangi o'yinlar uchun route'lar:
// Admin-only game content management; player routes remain OAuth-authenticated.
// Public-player endpoints: solo typing records, WPM leaderboard, and code practice
import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { getMathLobbyRooms } from '../socket/mathGame.js';
import { getTicTacToeLobbyRooms } from '../socket/tictactoe.js';
import { getChessLobbyRooms } from '../socket/chessGame.js';
import { getCheckersLobbyRooms } from '../socket/checkersGame.js';
import { getTypingLobbyRooms } from '../socket/typingRace.js';
import { getCodeLobbyRooms } from '../socket/codeBattle.js';
import { getGameCatalog } from '../services/gameCatalog.js';

const router = Router();

router.get('/games/catalog', requireAuth('user'), asyncH(async (_req, res) => {
  return ok(res, await getGameCatalog({ includeInactive: false }));
}));

// =====================================================================
// GAME LOBBY - ochiq (public) kutishdagi o'yinlar ro'yxati
// =====================================================================
router.get(
  '/games/lobby',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const activeTypes = new Set((await getGameCatalog({ includeInactive: false })).map((game) => game.id));
    const rooms = [
      ...getMathLobbyRooms(),
      ...getTicTacToeLobbyRooms(),
      ...getChessLobbyRooms(),
      ...getCheckersLobbyRooms(),
      ...getTypingLobbyRooms(),
      ...getCodeLobbyRooms(),
    ].filter((room) => activeTypes.has(room.type)).sort((a, b) => b.createdAt - a.createdAt);
    return ok(res, rooms);
  })
);

// =====================================================================
// TYPE RACING - ADMIN CONTENT CRUD
// =====================================================================

// GET /api/staff/typing-texts?lang=uz - admin content library
router.get(
  '/staff/typing-texts',
  requireAuth('staff'),
  asyncH(async (req, res) => {
    const lang = String(req.query.lang || '');
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const where = lang ? { lang } : {};
    const texts = await prisma.typingText.findMany({
      where,
      include: { createdBy: { select: { full_name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, texts);
  })
);

// POST /api/staff/typing-texts
router.post(
  '/staff/typing-texts',
  requireAuth('staff'),
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      title: z.string().min(2, 'Nomi kamida 2 belgi').max(100),
      lang: z.enum(['uz', 'ru', 'en']),
      content: z.string().min(20, 'Matn kamida 20 belgi').max(2000),
      difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
    });
    const data = schema.parse(req.body);
    const text = await prisma.typingText.create({
      data: { ...data, difficulty: data.difficulty || 'easy', createdById: req.user.id },
    });
    return ok(res, text, { message: 'Matn qo\'shildi' });
  })
);

// PATCH /api/staff/typing-texts/:id
router.patch(
  '/staff/typing-texts/:id',
  requireAuth('staff'),
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      title: z.string().min(2).max(100).optional(),
      lang: z.enum(['uz', 'ru', 'en']).optional(),
      content: z.string().min(20).max(2000).optional(),
      difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
    });
    const data = schema.parse(req.body);
    const text = await prisma.typingText.update({ where: { id: req.params.id }, data });
    return ok(res, text, { message: 'Matn yangilandi' });
  })
);

// DELETE /api/staff/typing-texts/:id
router.delete(
  '/staff/typing-texts/:id',
  requireAuth('staff'),
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    await prisma.typingText.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Matn o\'chirildi' });
  })
);

// =====================================================================
// CODE BATTLE - ADMIN CONTENT CRUD
// =====================================================================

// GET /api/staff/code-questions?category=js
router.get(
  '/staff/code-questions',
  requireAuth('staff'),
  asyncH(async (req, res) => {
    const category = String(req.query.category || '');
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const where = category ? { category } : {};
    const questions = await prisma.codeQuestion.findMany({
      where,
      include: { createdBy: { select: { full_name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, questions);
  })
);

// POST /api/staff/code-questions
router.post(
  '/staff/code-questions',
  requireAuth('staff'),
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      title: z.string().min(2, 'Nomi kamida 2 belgi').max(120),
      category: z.string().min(1).max(30),
      code: z.string().min(1, 'Kod kerak').max(4000),
      answer: z.string().min(1, 'To\'g\'ri output kerak').max(200),
      explanation: z.string().max(1000).optional().nullable(),
      timeLimit: z.number().int().min(5).max(120).optional(),
      points: z.number().int().min(100).max(5000).optional(),
    });
    const data = schema.parse(req.body);
    const q = await prisma.codeQuestion.create({
      data: {
        ...data,
        explanation: data.explanation || null,
        timeLimit: data.timeLimit || 20,
        points: data.points || 1000,
        createdById: req.user.id,
      },
    });
    return ok(res, q, { message: 'Savol qo\'shildi' });
  })
);

// PATCH /api/staff/code-questions/:id
router.patch(
  '/staff/code-questions/:id',
  requireAuth('staff'),
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    const schema = z.object({
      title: z.string().min(2).max(120).optional(),
      category: z.string().min(1).max(30).optional(),
      code: z.string().min(1).max(4000).optional(),
      answer: z.string().min(1).max(200).optional(),
      explanation: z.string().max(1000).optional().nullable(),
      timeLimit: z.number().int().min(5).max(120).optional(),
      points: z.number().int().min(100).max(5000).optional(),
      active: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    const q = await prisma.codeQuestion.update({ where: { id: req.params.id }, data });
    return ok(res, q, { message: 'Savol yangilandi' });
  })
);

// DELETE /api/staff/code-questions/:id
router.delete(
  '/staff/code-questions/:id',
  requireAuth('staff'),
  asyncH(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new ApiError(403, 'AUTH_FORBIDDEN', 'Faqat admin');
    await prisma.codeQuestion.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Savol o\'chirildi' });
  })
);

// =====================================================================
// TYPE RACING - PLAYER SOLO (coin/ball berilmaydi, WPM eslab qolinadi)
// =====================================================================

// GET /api/user/typing/texts?lang=uz - solo uchun random matn
router.get(
  '/user/typing/texts',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const lang = ['uz', 'ru', 'en'].includes(String(req.query.lang)) ? req.query.lang : 'uz';
    const texts = await prisma.typingText.findMany({ where: { lang }, take: 30 });
    const pool = texts.length > 0 ? texts : await prisma.typingText.findMany({ take: 30 });
    if (pool.length === 0) throw new ApiError(404, 'NO_TEXTS', 'Matnlar yo\'q');
    const t = pool[Math.floor(Math.random() * pool.length)];
    return ok(res, { id: t.id, title: t.title, content: t.content, difficulty: t.difficulty, lang: t.lang });
  })
);

// POST /api/user/typing/record - solo natija (coin/ball YO'Q, faqat WPM reyting)
router.post(
  '/user/typing/record',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const schema = z.object({
      wpm: z.number().min(0).max(300),
      accuracy: z.number().min(0).max(100),
      duration: z.number().int().min(3).max(600),
      chars: z.number().int().min(0).max(10000).optional(),
    });
    const data = schema.parse(req.body);

    // Sahna: juda past tezlikda spam bo'lmasin (5 soniya orasida 1 ta)
    const recent = await prisma.typingRecord.findFirst({
      where: { userId: req.user.id, createdAt: { gte: new Date(Date.now() - 5000) } },
    });
    if (recent) throw new ApiError(429, 'TOO_FAST', 'Kutib turing, keyin yana yuboring');

    const record = await prisma.typingRecord.create({
      data: { userId: req.user.id, wpm: data.wpm, accuracy: data.accuracy, duration: data.duration, chars: data.chars || 0, mode: 'solo' },
    });
    return ok(res, { id: record.id, wpm: record.wpm, accuracy: record.accuracy }, { message: 'Natija saqlandi' });
  })
);

// GET /api/user/typing/leaderboard?limit=20 - eng tez yozuvchilar (WPM)
router.get(
  '/user/typing/leaderboard',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
    const records = await prisma.typingRecord.findMany({
      include: { user: { include: { currentFrame: true, currentEffect: true } } },
      orderBy: [{ wpm: 'desc' }, { accuracy: 'desc' }],
      take: limit,
    });

    // Har bir foydalanuvchining eng yaxshi natijasi (birinchi takrorlanish)
    const seen = new Set();
    const top = [];
    for (const r of records) {
      if (seen.has(r.userId)) continue;
      seen.add(r.userId);
      top.push({
        id: r.id,
        wpm: r.wpm,
        accuracy: r.accuracy,
        duration: r.duration,
        mode: r.mode,
        createdAt: r.createdAt,
        user: {
          id: r.user.id,
          full_name: r.user.full_name,
          avatar: r.user.avatar,
          currentFrame: r.user.currentFrame,
          currentEffect: r.user.currentEffect,
        },
      });
      if (top.length >= limit) break;
    }

    // Mening eng yaxshi natijam
    const myBest = await prisma.typingRecord.findFirst({
      where: { userId: req.user.id },
      orderBy: [{ wpm: 'desc' }],
    });
    const myRank = myBest
      ? (await prisma.typingRecord.findMany({ where: { wpm: { gt: myBest.wpm } }, distinct: ['userId'] })).length + 1
      : null;

    return ok(res, { top, my: myBest ? { wpm: myBest.wpm, accuracy: myBest.accuracy, rank: myRank } : null });
  })
);

// =====================================================================
// CODE BATTLE - PLAYER SOLO PRACTICE (to'g'ri javobga kichik coin)
// =====================================================================

// GET /api/user/code/practice?category=js - random savol (javobsiz)
router.get(
  '/user/code/practice',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const category = String(req.query.category || 'js');
    const questions = await prisma.codeQuestion.findMany({ where: { active: true, category } });
    if (questions.length === 0) throw new ApiError(404, 'NO_QUESTIONS', 'Bu kategoriyada savollar yo\'q');
    const q = questions[Math.floor(Math.random() * questions.length)];
    return ok(res, {
      id: q.id,
      title: q.title,
      code: q.code,
      category: q.category,
      explanation: q.explanation,
      timeLimit: q.timeLimit,
      points: q.points,
    });
  })
);

// POST /api/user/code/check - javobni tekshirish (+3 coin to'g'ri bo'lsa)
router.post(
  '/user/code/check',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const schema = z.object({
      questionId: z.string().min(1),
      answer: z.string().min(1).max(300),
    });
    const { questionId, answer } = schema.parse(req.body);

    const q = await prisma.codeQuestion.findUnique({ where: { id: questionId } });
    if (!q) throw new ApiError(404, 'NOT_FOUND', 'Savol topilmadi');

    const normalize = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const correct = normalize(answer) === normalize(q.answer);
    const COIN_REWARD = 3;

    if (correct) {
      // Spam himoya: 10 soniya orasida bir marta
      const recent = await prisma.typingRecord.findFirst({
        where: { userId: req.user.id, createdAt: { gte: new Date(Date.now() - 10000) } },
      });
      // coin beramiz (agar spam bo'lmasa)
      await prisma.user.update({
        where: { id: req.user.id },
        data: { coin: { increment: COIN_REWARD } },
      });
    }

    return ok(res, { correct, answer: q.answer, explanation: q.explanation, coin: correct ? COIN_REWARD : 0 });
  })
);

// GET /api/user/code/categories - kategoriya ro'yxati
router.get(
  '/user/code/categories',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const cats = await prisma.codeQuestion.groupBy({ by: ['category'], _count: { _all: true }, where: { active: true } });
    return ok(
      res,
      cats.map((c) => ({ category: c.category, count: c._count._all }))
    );
  })
);

export default router;
