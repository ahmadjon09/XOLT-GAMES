import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

const router = Router();
router.use(requireAuth('user'));

const imageSchema = z.string().refine((value) => {
  if (value.startsWith('/')) return value.startsWith('/uploads/');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}, 'Rasm manzili noto\'g\'ri');

const questionSchema = z.object({
  text: z.string().min(1, 'Savol matni kerak').max(500),
  variants: z.array(z.string().min(1)).min(2, 'Kamida 2 variant kerak').max(6),
  answer: z.string().min(1),
  image: imageSchema.optional().nullable(),
  timeLimit: z.number().int().min(5).max(120).optional(),
  points: z.number().int().min(100).max(5000).optional(),
});

const quizSchema = z.object({
  name: z.string().min(2, 'Nomi kamida 2 belgi').max(80),
  keywords: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  image: imageSchema.optional().nullable(),
  questions: z.array(questionSchema).min(1, 'Kamida 1 ta savol kerak').max(100),
});

function validateAnswers(questions) {
  for (const question of questions || []) {
    if (!question.variants.includes(question.answer)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `"${question.text.slice(0, 40)}" savolining javobi variantlarda yo'q`);
    }
  }
}

const questionCreates = (questions) => questions.map((question, index) => ({
  text: question.text,
  variants: question.variants,
  answer: question.answer,
  image: question.image || null,
  timeLimit: question.timeLimit || 20,
  points: question.points || 1000,
  sortOrder: index,
}));

// GET /api/user/quizzes — my quizzes and public games I am allowed to host.
router.get('/', asyncH(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const quizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { createdByUserId: req.user.id },
        { isPublic: true, active: true },
      ],
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    include: {
      _count: { select: { questions: true } },
      createdByUser: { select: { id: true, full_name: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ok(res, quizzes.map((quiz) => ({
    id: quiz.id,
    name: quiz.name,
    keywords: quiz.keywords,
    image: quiz.image,
    active: quiz.active,
    isPublic: quiz.isPublic,
    isOwner: quiz.createdByUserId === req.user.id,
    createdBy: quiz.createdByUser,
    questionsCount: quiz._count.questions,
    createdAt: quiz.createdAt,
  })));
}));

// POST /api/user/quizzes — any OAuth player can create a quiz.
router.post('/', asyncH(async (req, res) => {
  const data = quizSchema.parse(req.body);
  validateAnswers(data.questions);
  const quiz = await prisma.quiz.create({
    data: {
      name: data.name,
      keywords: data.keywords || [],
      image: data.image || null,
      createdByUserId: req.user.id,
      active: true,
      isPublic: true,
      questions: { create: questionCreates(data.questions) },
    },
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
  });
  return ok(res, quiz, { message: 'Viktorina yaratildi' });
}));

// GET /api/user/quizzes/:id — question answers are only returned to their owner.
router.get('/:id', asyncH(async (req, res) => {
  const quiz = await prisma.quiz.findFirst({
    where: { id: req.params.id, createdByUserId: req.user.id },
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!quiz) throw new ApiError(404, 'NOT_FOUND', 'Viktorina topilmadi');
  return ok(res, quiz);
}));

// PATCH /api/user/quizzes/:id — owner-only editor.
router.patch('/:id', asyncH(async (req, res) => {
  const existing = await prisma.quiz.findFirst({ where: { id: req.params.id, createdByUserId: req.user.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Viktorina topilmadi');
  const data = quizSchema.partial().parse(req.body);
  if (data.questions) validateAnswers(data.questions);

  await prisma.$transaction(async (tx) => {
    if (data.questions) await tx.question.deleteMany({ where: { quizId: existing.id } });
    await tx.quiz.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.keywords !== undefined ? { keywords: data.keywords } : {}),
        ...(data.image !== undefined ? { image: data.image } : {}),
        ...(data.questions ? { questions: { create: questionCreates(data.questions) } } : {}),
      },
    });
  });
  return ok(res, { id: existing.id, message: 'Viktorina yangilandi' });
}));

router.delete('/:id', asyncH(async (req, res) => {
  const result = await prisma.quiz.deleteMany({ where: { id: req.params.id, createdByUserId: req.user.id } });
  if (!result.count) throw new ApiError(404, 'NOT_FOUND', 'Viktorina topilmadi');
  return ok(res, { id: req.params.id, message: 'Viktorina o\'chirildi' });
}));

export default router;
