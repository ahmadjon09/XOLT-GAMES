// Xodim route'lari - teacher (guruhlar, davomat, viktorinalar), cashier (to'lovlar), admin (statistika, boshqaruv)
import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword } from '../utils/security.js';
import { normalizePhone, monthKey } from '../utils/helpers.js';
import { effectiveFee, normalizeStatus, paymentView } from '../utils/payments.js';
import { prisma } from '../prisma/client.js';

const router = Router();
router.use(requireAuth('staff'));

// Guruhga kirish huquqini tekshiradi: teacher faqat o'z guruhlarini, admin/cashier hammasini
const canAccessGroup = async (staff, groupId) => {
  if (staff.role === 'ADMIN' || staff.role === 'CASHIER') return true;
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new ApiError(404, 'NOT_FOUND', 'Guruh topilmadi');
  if (group.teacherId !== staff.id) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Bu guruh sizga tegishli emas');
  return true;
};

// ============ O'Z PROFFILI (barcha xodimlar) ============

// GET /api/staff/profile - o'z profilini ko'rish
router.get(
  '/profile',
  asyncH(async (req, res) => {
    const s = await prisma.staff.findUnique({ where: { id: req.user.id } });
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'Xodim topilmadi');
    const [groupsCount, quizzesCount] = await Promise.all([
      prisma.group.count({ where: { teacherId: s.id } }),
      prisma.quiz.count({ where: { createdById: s.id } }),
    ]);
    return ok(res, {
      id: s.id,
      full_name: s.full_name,
      phone: s.phone,
      avatar: s.avatar,
      role: s.role,
      groupsCount,
      quizzesCount,
      createdAt: s.createdAt,
    });
  })
);

// PATCH /api/staff/profile - o'z profilini tahrirlash (ism / telefon)
router.patch(
  '/profile',
  asyncH(async (req, res) => {
    const schema = z.object({
      full_name: z.string().min(3, 'Ism kamida 3 belgi').max(60).optional(),
      phone: z.string().min(7, 'Telefon kiriting').optional(),
    });
    const data = schema.parse(req.body);

    const update = {};
    if (data.full_name !== undefined) update.full_name = data.full_name;
    if (data.phone !== undefined) {
      const phone = normalizePhone(data.phone);
      if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Telefon noto\'g\'ri');
      const exists = await prisma.staff.findUnique({ where: { phone } });
      if (exists && exists.id !== req.user.id) throw new ApiError(409, 'PHONE_EXISTS', 'Bu telefon allaqachon band');
      update.phone = phone;
    }

    if (Object.keys(update).length === 0) return ok(res, { message: 'Hech narsa o\'zgarmadi' });
    const s = await prisma.staff.update({ where: { id: req.user.id }, data: update });
    return ok(res, { id: s.id, full_name: s.full_name, phone: s.phone, avatar: s.avatar, role: s.role, createdAt: s.createdAt }, { message: 'Profil yangilandi' });
  })
);

// ============ GURUHLAR ============

// GET /api/staff/groups - teacher o'zini, admin/cashier hammasini ko'radi
router.get(
  '/groups',
  asyncH(async (req, res) => {
    const where = req.user.role === 'TEACHER' ? { teacherId: req.user.id } : {};
    const groups = await prisma.group.findMany({
      where,
      include: {
        teacher: { select: { id: true, full_name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ok(
      res,
      groups.map((g) => ({ id: g.id, name: g.name, monthlyFee: g.monthlyFee, teacher: g.teacher, membersCount: g._count.members, createdAt: g.createdAt }))
    );
  })
);

// POST /api/staff/groups - guruh yaratish
router.post(
  '/groups',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'TEACHER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
    const schema = z.object({ name: z.string().min(2, 'Guruh nomi kamida 2 belgi').max(60), monthlyFee: z.number().min(0).max(100_000_000).optional() });
    const { name, monthlyFee } = schema.parse(req.body);

    const teacherId = req.user.role === 'ADMIN' && req.body.teacherId ? req.body.teacherId : req.user.id;
    const teacher = await prisma.staff.findUnique({ where: { id: teacherId } });
    if (!teacher || teacher.role === 'CASHIER') throw new ApiError(400, 'INVALID_TEACHER', 'O\'qituvchi topilmadi');

    const group = await prisma.group.create({ data: { name, monthlyFee: monthlyFee || 0, teacherId } });
    return ok(res, group);
  })
);

// PATCH /api/staff/groups/:id
router.patch(
  '/groups/:id',
  asyncH(async (req, res) => {
    await canAccessGroup(req.user.db, req.params.id);
    const schema = z.object({ name: z.string().min(2).max(60).optional(), monthlyFee: z.number().min(0).max(100_000_000).optional() });
    const data = schema.parse(req.body);
    const group = await prisma.group.update({ where: { id: req.params.id }, data });
    return ok(res, group);
  })
);

// DELETE /api/staff/groups/:id
router.delete(
  '/groups/:id',
  asyncH(async (req, res) => {
    await canAccessGroup(req.user.db, req.params.id);
    await prisma.group.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Guruh o\'chirildi' });
  })
);

// GET /api/staff/groups/:id - guruh a'zolari (profil buyumlari bilan)
router.get(
  '/groups/:id',
  asyncH(async (req, res) => {
    await canAccessGroup(req.user.db, req.params.id);
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        teacher: { select: { id: true, full_name: true } },
        members: {
          include: {
            user: {
              include: { currentFrame: true, currentEffect: true, _count: { select: { attendances: true, payments: true } } },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!group) throw new ApiError(404, 'NOT_FOUND', 'Guruh topilmadi');

    // Har bir o'quvchining davomat va to'lov qisqacha holati
    const userIds = group.members.map((m) => m.userId);
    const [attendance, payments] = await Promise.all([
      prisma.attendance.groupBy({ by: ['userId', 'status'], where: { userId: { in: userIds }, groupId: group.id }, _count: { _all: true } }),
      prisma.payment.findMany({ where: { userId: { in: userIds }, groupId: group.id }, orderBy: { month: 'desc' } }),
    ]);

    return ok(
      res,
      group.members.map((m) => ({
        id: m.user.id,
        full_name: m.user.full_name,
        avatar: m.user.avatar,
        username: m.user.username,
        phone: m.user.phone,
        coin: m.user.coin,
        score: m.user.score,
        currentFrame: m.user.currentFrame,
        currentEffect: m.user.currentEffect,
        joinedAt: m.joinedAt,
        attendance: {
          present: attendance.filter((a) => a.userId === m.user.id && a.status === 'present')[0]?._count._all || 0,
          absent: attendance.filter((a) => a.userId === m.user.id && a.status === 'absent')[0]?._count._all || 0,
          late: attendance.filter((a) => a.userId === m.user.id && a.status === 'late')[0]?._count._all || 0,
        },
        payments: payments
          .filter((p) => p.userId === m.user.id)
          .map((p) => ({ id: p.id, month: p.month, amount: p.amount, status: p.status, paidAt: p.paidAt })),
      }))
    );
  })
);

// POST /api/staff/groups/:id/members - o'quvchini guruhga qo'shish (telefon orqali yoki yangi yaratib)
router.post(
  '/groups/:id/members',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'TEACHER', 'CASHIER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
    await canAccessGroup(req.user.db, req.params.id);

    const schema = z.object({
      phone: z.string().min(7).optional(),
      full_name: z.string().min(3).optional(),
      password: z.string().min(4).optional(),
    });
    const body = schema.parse(req.body);

    let userId = null;
    const normalized = normalizePhone(body.phone);

    if (normalized) {
      const existing = await prisma.user.findUnique({ where: { phone: normalized } });
      if (existing) {
        userId = existing.id;
      } else if (body.full_name) {
        const created = await prisma.user.create({
          data: {
            full_name: body.full_name,
            phone: normalized,
            password: await hashPassword(body.password || '123456'),
            createdById: req.user.id,
          },
        });
        userId = created.id;
      } else {
        throw new ApiError(400, 'USER_NOT_FOUND', 'Bu telefonli o\'quvchi topilmadi. Ism kiritsangiz avtomatik yaratiladi');
      }
    } else if (body.full_name) {
      // Telefonsiz yaratish - test uchun
      const phone = `+${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
      const created = await prisma.user.create({
        data: {
          full_name: body.full_name,
          phone,
          password: await hashPassword(body.password || '123456'),
          createdById: req.user.id,
        },
      });
      userId = created.id;
    } else {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Telefon yoki ism kiritilishi kerak');
    }

    const existingMember = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId: req.params.id } },
    });
    if (!existingMember) {
      await prisma.groupMember.create({ data: { userId, groupId: req.params.id } });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { currentFrame: true, currentEffect: true } });
    return ok(res, {
      message: 'Guruhga qo\'shildi',
      user: { id: user.id, full_name: user.full_name, phone: user.phone, avatar: user.avatar, currentFrame: user.currentFrame, currentEffect: user.currentEffect },
    });
  })
);

// DELETE /api/staff/groups/:id/members/:userId
router.delete(
  '/groups/:id/members/:userId',
  asyncH(async (req, res) => {
    await canAccessGroup(req.user.db, req.params.id);
    await prisma.groupMember.delete({
      where: { userId_groupId: { userId: req.params.userId, groupId: req.params.id } },
    });
    return ok(res, { message: 'Guruhdan olib tashlandi' });
  })
);

// ============ DAVOMAT ============

// GET /api/staff/attendance?groupId&date=YYYY-MM-DD - ma'lum kundagi davomat
router.get(
  '/attendance',
  asyncH(async (req, res) => {
    const groupId = String(req.query.groupId || '');
    const dateStr = String(req.query.date || '');

    if (!groupId || !dateStr) throw new ApiError(400, 'VALIDATION_ERROR', 'groupId va date kerak');
    await canAccessGroup(req.user.db, groupId);

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'Sana noto\'g\'ri formatda');

    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: { include: { currentFrame: true, currentEffect: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const records = await prisma.attendance.findMany({ where: { groupId, date } });

    return ok(
      res,
      members.map((m) => {
        const rec = records.find((r) => r.userId === m.user.id);
        return {
          userId: m.user.id,
          full_name: m.user.full_name,
          avatar: m.user.avatar,
          currentFrame: m.user.currentFrame,
          status: rec ? rec.status : 'unmarked',
          note: rec?.note || null,
        };
      })
    );
  })
);

// POST /api/staff/attendance/save - davomatni saqlash (bir kunda ko'p o'quvchi)
router.post(
  '/attendance/save',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'TEACHER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
    const schema = z.object({
      groupId: z.string().min(1),
      date: z.string().min(1),
      items: z.array(
        z.object({
          userId: z.string().min(1),
          status: z.enum(['present', 'absent', 'late']),
          note: z.string().max(200).optional().nullable(),
        })
      ),
    });
    const { groupId, date, items } = schema.parse(req.body);
    await canAccessGroup(req.user.db, groupId);

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'Sana noto\'g\'ri');

    await prisma.$transaction(
      items.map((it) =>
        prisma.attendance.upsert({
          where: { userId_groupId_date: { userId: it.userId, groupId, date: parsed } },
          create: { userId: it.userId, groupId, date: parsed, status: it.status, note: it.note || null, staffId: req.user.id },
          update: { status: it.status, note: it.note || null, staffId: req.user.id },
        })
      )
    );

    return ok(res, { message: 'Davomat saqlandi', count: items.length });
  })
);

// GET /api/staff/attendance/summary?groupId&month=YYYY-MM - oy bo'yicha statistika
router.get(
  '/attendance/summary',
  asyncH(async (req, res) => {
    const groupId = String(req.query.groupId || '');
    if (!groupId) throw new ApiError(400, 'VALIDATION_ERROR', 'groupId kerak');
    await canAccessGroup(req.user.db, groupId);

    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { include: { currentFrame: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    const month = String(req.query.month || monthKey());
    const [y, m] = month.split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);

    const records = await prisma.attendance.findMany({
      where: { groupId, date: { gte: from, lt: to } },
      orderBy: { date: 'asc' },
    });

    // Oydagi kunlar ro'yxati
    const daysInMonth = new Date(y, m, 0).getDate();
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dates.push(key);
    }

    const rows = members.map((mem) => {
      const mine = records.filter((r) => r.userId === mem.user.id);
      // Har bir kun bo'yicha holat (sana bilan) — box'lar uchun
      const statusByDate = {};
      mine.forEach((r) => {
        statusByDate[r.date.toISOString().slice(0, 10)] = r.status;
      });
      return {
        userId: mem.user.id,
        full_name: mem.user.full_name,
        avatar: mem.user.avatar,
        currentFrame: mem.user.currentFrame,
        present: mine.filter((r) => r.status === 'present').length,
        absent: mine.filter((r) => r.status === 'absent').length,
        late: mine.filter((r) => r.status === 'late').length,
        marked: mine.length,
        days: dates.map((d) => statusByDate[d] || null),
      };
    });

    return ok(res, { month, dates, rows });
  })
);

// ============ VIKTORINALAR (teacher) ============

// GET /api/staff/quizzes
router.get(
  '/quizzes',
  asyncH(async (req, res) => {
    const where = req.user.role === 'TEACHER' ? { createdById: req.user.id } : {};
    const quizzes = await prisma.quiz.findMany({
      where,
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok(
      res,
      quizzes.map((q) => ({
        id: q.id,
        name: q.name,
        keywords: q.keywords,
        image: q.image,
        questionsCount: q._count.questions,
        createdAt: q.createdAt,
      }))
    );
  })
);

// POST /api/staff/quizzes - viktorina yaratish (savollar bilan birga)
router.post(
  '/quizzes',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'TEACHER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');

    const schema = z.object({
      name: z.string().min(2, 'Nomi kamida 2 belgi').max(80),
      keywords: z.array(z.string()).max(10).optional(),
      image: z.string().url().optional().nullable(),
      questions: z
        .array(
          z.object({
            text: z.string().min(1, 'Savol matni kerak').max(500),
            variants: z.array(z.string().min(1)).min(2, 'Kamida 2 variant kerak').max(6),
            answer: z.string().min(1),
            image: z.string().url().optional().nullable(),
            timeLimit: z.number().int().min(5).max(120).optional(),
            points: z.number().int().min(100).max(5000).optional(),
          })
        )
        .min(1, 'Kamida 1 ta savol kerak')
        .max(100),
    });
    const data = schema.parse(req.body);

    // To'g'ri javob variantlar ichida bo'lishi shart
    for (const q of data.questions) {
      if (!q.variants.includes(q.answer)) {
        throw new ApiError(400, 'VALIDATION_ERROR', `"${q.text.slice(0, 40)}" savolining to'g'ri javobi variantlarda yo'q`);
      }
    }

    const quiz = await prisma.quiz.create({
      data: {
        name: data.name,
        keywords: data.keywords || [],
        image: data.image || null,
        createdById: req.user.id,
        questions: {
          create: data.questions.map((q, i) => ({
            text: q.text,
            variants: q.variants,
            answer: q.answer,
            image: q.image || null,
            timeLimit: q.timeLimit || 20,
            points: q.points || 1000,
            sortOrder: i,
          })),
        },
      },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    return ok(res, quiz, { message: 'Viktorina yaratildi' });
  })
);

// GET /api/staff/quizzes/:id
router.get(
  '/quizzes/:id',
  asyncH(async (req, res) => {
    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.id },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quiz) throw new ApiError(404, 'NOT_FOUND', 'Viktorina topilmadi');
    if (req.user.role === 'TEACHER' && quiz.createdById !== req.user.id) {
      throw new ApiError(403, 'AUTH_FORBIDDEN', 'Bu viktorina sizga tegishli emas');
    }
    return ok(res, quiz);
  })
);

// PATCH /api/staff/quizzes/:id - to'liq yangilash (savollar almashtiriladi)
router.patch(
  '/quizzes/:id',
  asyncH(async (req, res) => {
    const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id } });
    if (!quiz) throw new ApiError(404, 'NOT_FOUND', 'Viktorina topilmadi');
    if (req.user.role === 'TEACHER' && quiz.createdById !== req.user.id) {
      throw new ApiError(403, 'AUTH_FORBIDDEN', 'Bu viktorina sizga tegishli emas');
    }

    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      keywords: z.array(z.string()).max(10).optional(),
      image: z.string().url().optional().nullable(),
      questions: z
        .array(
          z.object({
            text: z.string().min(1).max(500),
            variants: z.array(z.string().min(1)).min(2).max(6),
            answer: z.string().min(1),
            image: z.string().url().optional().nullable(),
            timeLimit: z.number().int().min(5).max(120).optional(),
            points: z.number().int().min(100).max(5000).optional(),
          })
        )
        .min(1)
        .max(100)
        .optional(),
    });
    const data = schema.parse(req.body);
    for (const q of data.questions || []) {
      if (!q.variants.includes(q.answer)) {
        throw new ApiError(400, 'VALIDATION_ERROR', `"${q.text.slice(0, 40)}" savolining to'g'ri javobi variantlarda yo'q`);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { quizId: quiz.id } });
      await tx.quiz.update({
        where: { id: quiz.id },
        data: {
          name: data.name ?? quiz.name,
          keywords: data.keywords ?? quiz.keywords,
          image: data.image === undefined ? quiz.image : data.image,
          questions: {
            create: (data.questions || []).map((q, i) => ({
              text: q.text,
              variants: q.variants,
              answer: q.answer,
              image: q.image || null,
              timeLimit: q.timeLimit || 20,
              points: q.points || 1000,
              sortOrder: i,
            })),
          },
        },
      });
    });

    return ok(res, { message: 'Viktorina yangilandi' });
  })
);

// DELETE /api/staff/quizzes/:id
router.delete(
  '/quizzes/:id',
  asyncH(async (req, res) => {
    const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id } });
    if (!quiz) throw new ApiError(404, 'NOT_FOUND', 'Viktorina topilmadi');
    if (req.user.role === 'TEACHER' && quiz.createdById !== req.user.id) {
      throw new ApiError(403, 'AUTH_FORBIDDEN', 'Bu viktorina sizga tegishli emas');
    }
    await prisma.quiz.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Viktorina o\'chirildi' });
  })
);

// ============ TO'LOVLAR (cashier) ============

// GET /api/staff/payments/groups - barcha guruhlar (to'lov oynasi uchun)
router.get(
  '/payments/groups',
  asyncH(async (req, res) => {
    const groups = await prisma.group.findMany({
      include: {
        teacher: { select: { full_name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return ok(
      res,
      groups.map((g) => ({ id: g.id, name: g.name, teacher: g.teacher.full_name, membersCount: g._count.members }))
    );
  })
);

// GET /api/staff/payments?groupId&month - guruh bo'yicha to'lovlar
router.get(
  '/payments',
  asyncH(async (req, res) => {
    const groupId = String(req.query.groupId || '');
    if (!groupId) throw new ApiError(400, 'VALIDATION_ERROR', 'groupId kerak');
    const month = String(req.query.month || monthKey());

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { include: { currentFrame: true, currentEffect: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!group) throw new ApiError(404, 'NOT_FOUND', 'Guruh topilmadi');

    const payments = await prisma.payment.findMany({ where: { groupId, month } });
    const allPayments = await prisma.payment.findMany({ where: { groupId } });

    const monthlyFee = group.monthlyFee;

    return ok(
      res,
      group.members.map((m) => {
        const p = payments.find((x) => x.userId === m.user.id);
        const history = allPayments
          .filter((x) => x.userId === m.user.id)
          .sort((a, b) => (a.month < b.month ? 1 : -1));
        return {
          userId: m.user.id,
          full_name: m.user.full_name,
          avatar: m.user.avatar,
          currentFrame: m.user.currentFrame,
          phone: m.user.phone,
          monthlyFee,
          effectiveFee: monthlyFee,
          payment: p
            ? paymentView(p, group)
            : null,
          history: history.map((h) => ({ id: h.id, month: h.month, amount: h.amount, status: h.status })),
        };
      })
    );
  })
);

// POST /api/staff/payments - to'lov qo'shish / yangilash (upsert)
// discount — BIR MARTALIK chegirma (0-100%): faqat shu to'lovga qo'llanadi,
// o'quvchining keyingi to'lovlariga ta'sir qilmaydi
router.post(
  '/payments',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'CASHIER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
    const schema = z.object({
      userId: z.string().min(1),
      groupId: z.string().min(1),
      amount: z.number().positive('Summa musbat bo\'lishi kerak'),
      month: z.string().regex(/^\d{4}-\d{2}$/, 'Oy format: YYYY-MM'),
      status: z.enum(['paid', 'unpaid']).optional(),
      discount: z.number().int().min(0).max(100).optional(),
      note: z.string().max(200).optional().nullable(),
    });
    const data = schema.parse(req.body);

    const member = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: data.userId, groupId: data.groupId } },
      include: { group: true },
    });
    if (!member) throw new ApiError(400, 'NOT_IN_GROUP', 'O\'quvchi bu guruhda emas');

    // Mavjud to'lov bo'lsa — chegirma uzatilmagan bo'lsa eski qiymati qoladi
    const existing = await prisma.payment.findUnique({
      where: { userId_groupId_month: { userId: data.userId, groupId: data.groupId, month: data.month } },
    });
    const discount = data.discount !== undefined ? data.discount : existing?.discount || 0;

    // Bir martalik chegirma bilan effektiv to'lov: summa yetmasa -> partial (chala)
    const eff = effectiveFee(member.group.monthlyFee, discount);
    const finalStatus = data.status === 'unpaid' ? 'unpaid' : normalizeStatus(data.amount, eff);

    const payment = await prisma.payment.upsert({
      where: { userId_groupId_month: { userId: data.userId, groupId: data.groupId, month: data.month } },
      create: {
        userId: data.userId,
        groupId: data.groupId,
        amount: data.amount,
        month: data.month,
        status: finalStatus,
        discount,
        note: data.note || null,
        paidAt: finalStatus === 'paid' ? new Date() : null,
        createdById: req.user.id,
      },
      update: {
        amount: data.amount,
        status: finalStatus,
        discount,
        note: data.note !== undefined ? data.note : undefined,
        paidAt: finalStatus === 'paid' ? new Date() : finalStatus === 'unpaid' ? null : undefined,
      },
    });

    const view = paymentView(payment, member.group);
    return ok(res, view, { message: 'To\'lov saqlandi' });
  })
);

// PATCH /api/staff/payments/:id - holatini o'zgartirish (paid/unpaid)
router.patch(
  '/payments/:id',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'CASHIER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
    const schema = z.object({
      status: z.enum(['paid', 'unpaid']).optional(),
      amount: z.number().positive().optional(),
      discount: z.number().int().min(0).max(100).optional(),
      note: z.string().max(200).optional().nullable(),
    });
    const data = schema.parse(req.body);

    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { group: true },
    });
    if (!payment) throw new ApiError(404, 'NOT_FOUND', 'To\'lov topilmadi');

    const discount = data.discount !== undefined ? data.discount : payment.discount;
    const eff = effectiveFee(payment.group.monthlyFee, discount);
    const amount = data.amount ?? payment.amount;
    const finalStatus = data.status === 'unpaid' ? 'unpaid' : data.status ?? normalizeStatus(amount, eff);

    const updated = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        status: finalStatus,
        amount,
        discount,
        note: data.note !== undefined ? data.note : payment.note,
        paidAt: finalStatus === 'paid' ? new Date() : finalStatus === 'unpaid' ? null : payment.paidAt,
      },
    });

    const view = paymentView(updated, payment.group);
    return ok(res, view, { message: 'To\'lov holati yangilandi' });
  })
);

// DELETE /api/staff/payments/:id
router.delete(
  '/payments/:id',
  asyncH(async (req, res) => {
    if (!['ADMIN', 'CASHIER'].includes(req.user.role)) throw new ApiError(403, 'AUTH_FORBIDDEN', 'Ruxsat yoq');
    await prisma.payment.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'To\'lov o\'chirildi' });
  })
);

// GET /api/staff/payments/overview?month - guruhlar bo'yicha umumiy holat
router.get(
  '/payments/overview',
  asyncH(async (req, res) => {
    const month = String(req.query.month || monthKey());
    const groups = await prisma.group.findMany({
      include: { teacher: { select: { full_name: true } } },
    });
    const payments = await prisma.payment.findMany({ where: { month } });

    return ok(
      res,
      groups.map((g) => {
        const gp = payments.filter((p) => p.groupId === g.id);
        return {
          groupId: g.id,
          name: g.name,
          teacher: g.teacher.full_name,
          monthlyFee: g.monthlyFee,
          total: gp.length,
          paid: gp.filter((p) => p.status === 'paid').length,
          partial: gp.filter((p) => p.status === 'partial').length,
          unpaid: gp.filter((p) => p.status === 'unpaid').length,
          paidSum: gp.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0),
        };
      })
    );
  })
);

export default router;
