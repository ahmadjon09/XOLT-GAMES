// O'quvchi (student) route'lari - profil, shop, leaderboard, davomat, to'lovlar
import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { cacheGet, cacheSet } from '../cache/index.js';
import { paymentView } from '../utils/payments.js';

const router = Router();

// ============ PROFIL ============

// GET /api/user/profile - to'liq profil (guruhlar, joriy frame/effect bilan)
router.get(
  '/profile',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        currentFrame: true,
        currentEffect: true,
        groupMembers: { include: { group: { include: { teacher: true } } } },
        frames: true,
        effects: true,
      },
    });
    const attendance = await prisma.attendance.groupBy({
      by: ['status', 'groupId'],
      where: { userId: req.user.id },
      _count: { _all: true },
    });

    return ok(res, {
      id: u.id,
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
      ownedFrameIds: u.frames.map((f) => f.frameId),
      ownedEffectIds: u.effects.map((e) => e.effectId),
      groups: u.groupMembers.map((gm) => ({
        id: gm.group.id,
        name: gm.group.name,
        joinedAt: gm.joinedAt,
        teacher: gm.group.teacher ? { id: gm.group.teacher.id, full_name: gm.group.teacher.full_name } : null,
        attendance: {
          present: attendance.filter((a) => a.status === 'present' && a.groupId === gm.group.id)[0]?._count._all || 0,
          absent: attendance.filter((a) => a.status === 'absent' && a.groupId === gm.group.id)[0]?._count._all || 0,
          late: attendance.filter((a) => a.status === 'late' && a.groupId === gm.group.id)[0]?._count._all || 0,
        },
      })),
      createdAt: u.createdAt,
    });
  })
);

// PATCH /api/user/profile - username o'zgartirish
router.patch(
  '/profile',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const schema = z.object({
      username: z.string().min(3, 'Username kamida 3 belgi').max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username faqat harf, raqam va _ bo\'lishi mumkin').optional(),
      full_name: z.string().min(3, 'Ism kamida 3 belgi').max(60).optional(),
    });
    const data = schema.parse(req.body);

    const update = {};
    if (data.username !== undefined) update.username = data.username;
    if (data.full_name !== undefined) update.full_name = data.full_name;

    if (Object.keys(update).length === 0) return ok(res, { message: 'Hech narsa o\'zgarmadi' });
    const u = await prisma.user.update({ where: { id: req.user.id }, data: update });
    return ok(res, { message: 'Profil yangilandi', username: u.username, full_name: u.full_name });
  })
);

// ============ SHOP ============

// GET /api/user/shop - do'kon katalogi + egalik + joriy tanlov (katalog Redis'da 60s)
router.get(
  '/shop',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const catKey = 'xolt:shop:catalog';
    let catalog = await cacheGet(catKey);
    if (!catalog) {
      const [frames, effects] = await Promise.all([
        prisma.frame.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        prisma.effect.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      ]);
      catalog = { frames, effects };
      await cacheSet(catKey, catalog, 60);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { frames: true, effects: true, currentFrame: true, currentEffect: true },
    });

    return ok(res, {
      coin: user.coin,
      frames: catalog.frames,
      effects: catalog.effects,
      ownedFrameIds: user.frames.map((f) => f.frameId),
      ownedEffectIds: user.effects.map((e) => e.effectId),
      currentFrame: user.currentFrame,
      currentEffect: user.currentEffect,
    });
  })
);

// POST /api/user/shop/buy - buyum sotib olish
router.post(
  '/shop/buy',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const schema = z.object({
      type: z.enum(['frame', 'effect']),
      itemId: z.string().min(1),
    });
    const { type, itemId } = schema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');

    const model = type === 'frame' ? prisma.frame : prisma.effect;
    const item = await model.findUnique({ where: { id: itemId } });
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Buyum topilmadi');
    if (!item.active) throw new ApiError(400, 'ITEM_INACTIVE', 'Bu buyum hozircha sotuvda emas');

    // Egalikni tekshirish (sxemadagi compound unique nomlari: userId_frameId / userId_effectId)
    const owned = type === 'frame'
      ? await prisma.userFrame.findUnique({ where: { userId_frameId: { userId: user.id, frameId: itemId } } })
      : await prisma.userEffect.findUnique({ where: { userId_effectId: { userId: user.id, effectId: itemId } } });
    if (owned) throw new ApiError(400, 'ALREADY_OWNED', 'Siz bu buyumni allaqachon sotib olgansiz');

    if (user.coin < item.price) throw new ApiError(400, 'INSUFFICIENT_COINS', 'Yetarli coin yo\'q');

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { coin: { decrement: item.price } } }),
      type === 'frame'
        ? prisma.userFrame.create({ data: { userId: user.id, frameId: itemId } })
        : prisma.userEffect.create({ data: { userId: user.id, effectId: itemId } }),
    ]);

    return ok(res, { message: 'Sotib olindi', price: item.price });
  })
);

// POST /api/user/shop/equip - buyumni kiyish / yechish
router.post(
  '/shop/equip',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const schema = z.object({
      type: z.enum(['frame', 'effect']),
      itemId: z.string().min(1), // "none" bilan yechiladi
    });
    const { type, itemId } = schema.parse(req.body);

    const field = type === 'frame' ? 'currentFrameId' : 'currentEffectId';

    if (itemId !== 'none') {
      const owned = type === 'frame'
        ? await prisma.userFrame.findUnique({ where: { userId_frameId: { userId: req.user.id, frameId: itemId } } })
        : await prisma.userEffect.findUnique({ where: { userId_effectId: { userId: req.user.id, effectId: itemId } } });
      if (!owned) throw new ApiError(403, 'NOT_OWNED', 'Avval sotib olishingiz kerak');
    }

    const u = await prisma.user.update({
      where: { id: req.user.id },
      data: { [field]: itemId === 'none' ? null : itemId },
      include: { currentFrame: true, currentEffect: true },
    });

    return ok(res, { message: 'Tanlandi', currentFrame: u.currentFrame, currentEffect: u.currentEffect });
  })
);

// ============ LEADERBOARD ============

// GET /api/user/leaderboard?period=all|week|month&page=1&limit=20
// Pagination + joriy foydalanuvchi + guruh nomi; Redis cache (30s)
router.get(
  '/leaderboard',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const period = ['all', 'week', 'month'].includes(req.query.period) ? req.query.period : 'all';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
    const field = period === 'week' ? 'week_score' : period === 'month' ? 'month_score' : 'score';
    const cacheKey = `xolt:lb:${period}:${page}:${limit}`;

    const cached = await cacheGet(cacheKey);
    if (cached) return ok(res, cached);

    const [total, users, me] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        orderBy: { [field]: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          full_name: true,
          avatar: true,
          username: true,
          score: true,
          week_score: true,
          month_score: true,
          currentFrame: true,
          currentEffect: true,
          groupMembers: { include: { group: { select: { id: true, name: true } } }, take: 1 },
        },
      }),
      prisma.user.findUnique({ where: { id: req.user.id } }),
    ]);

    const leaderboard = [];
    for (const u of users) {
      leaderboard.push({
        id: u.id,
        full_name: u.full_name,
        avatar: u.avatar,
        username: u.username,
        currentFrame: u.currentFrame,
        currentEffect: u.currentEffect,
        group: u.groupMembers[0]?.group || null,
        score: u.score,
        week_score: u.week_score,
        month_score: u.month_score,
        rank: (await prisma.user.count({ where: { [field]: { gt: u[field] } } })) + 1,
      });
    }

    const myValue = me ? me[field] : 0;
    const myRank = me ? (await prisma.user.count({ where: { [field]: { gt: myValue } } })) + 1 : null;

    const result = {
      leaderboard,
      currentUser: me
        ? {
            id: me.id,
            full_name: me.full_name,
            avatar: me.avatar,
            username: me.username,
            currentFrame: me.currentFrame,
            currentEffect: me.currentEffect,
            score: me.score,
            week_score: me.week_score,
            month_score: me.month_score,
            rank: myRank,
          }
        : null,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };

    await cacheSet(cacheKey, result, 30);
    return ok(res, result);
  })
);

// ============ GURUHLAR ============

// GET /api/user/groups - mening guruhlarim (davomat va to'lov holati bilan)
router.get(
  '/groups',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.id },
      include: { group: { include: { teacher: true } } },
      orderBy: { joinedAt: 'desc' },
    });

    const groupIds = memberships.map((m) => m.groupId);
    const me = await prisma.user.findUnique({ where: { id: req.user.id } });
    const [attendance, payments] = await Promise.all([
      prisma.attendance.findMany({ where: { userId: req.user.id, groupId: { in: groupIds } }, orderBy: { date: 'desc' } }),
      prisma.payment.findMany({ where: { userId: req.user.id, groupId: { in: groupIds } }, orderBy: { month: 'desc' } }),
    ]);

    return ok(
      res,
      memberships.map((m) => {
        const groupAttendance = attendance.filter((a) => a.groupId === m.groupId);
        const groupPayments = payments.filter((p) => p.groupId === m.groupId);
        return {
          id: m.group.id,
          name: m.group.name,
          joinedAt: m.joinedAt,
          monthlyFee: m.group.monthlyFee,
          discount: me ? me.discount : 0,
          teacher: m.group.teacher ? { id: m.group.teacher.id, full_name: m.group.teacher.full_name } : null,
          attendance: {
            present: groupAttendance.filter((a) => a.status === 'present').length,
            absent: groupAttendance.filter((a) => a.status === 'absent').length,
            late: groupAttendance.filter((a) => a.status === 'late').length,
            total: groupAttendance.length,
          },
          payments: groupPayments.map((p) => paymentView(p, m.group, me)),
        };
      })
    );
  })
);

// GET /api/user/attendance?groupId=xxx - guruh bo'yicha davomat tarixi
router.get(
  '/attendance',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const groupId = String(req.query.groupId || '');
    if (!groupId) throw new ApiError(400, 'VALIDATION_ERROR', 'groupId kerak');

    const member = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.user.id, groupId } },
    });
    if (!member) throw new ApiError(403, 'NOT_IN_GROUP', 'Siz bu guruhga a\'zo emassiz');

    const records = await prisma.attendance.findMany({
      where: { userId: req.user.id, groupId },
      orderBy: { date: 'desc' },
    });

    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { teacher: true } });

    // Oxirgi 30 kun uchun holat matritsasi (sana bo'yicha)
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const rec = records.find((r) => {
        const rd = r.date;
        const rkey = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`;
        return rkey === key;
      });
      days.push({ date: key, status: rec ? rec.status : null });
    }

    return ok(res, {
      group: group ? { id: group.id, name: group.name, teacher: group.teacher?.full_name || null } : null,
      summary: {
        present: records.filter((r) => r.status === 'present').length,
        absent: records.filter((r) => r.status === 'absent').length,
        late: records.filter((r) => r.status === 'late').length,
        total: records.length,
      },
      days,
      records: records.slice(0, 60),
    });
  })
);

// GET /api/user/payments - to'lov holatim (monthlyFee + discount bilan)
router.get(
  '/payments',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.user.id } });
    const payments = await prisma.payment.findMany({
      where: { userId: req.user.id },
      include: { group: true },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
    });

    return ok(
      res,
      payments.map((p) => {
        const view = paymentView(p, p.group, me);
        return {
          ...view,
          group: { id: p.group.id, name: p.group.name },
        };
      })
    );
  })
);

export default router;
