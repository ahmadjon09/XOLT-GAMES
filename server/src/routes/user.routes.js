// Public player routes - profile, shop, and global leaderboard
import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { cacheGet, cacheSet } from '../cache/index.js';
import { getOnlineActivity, getOnlineIds, getPresenceStatuses } from '../mongo/runtimeStore.js';

const router = Router();

const publicPlayerSelect = {
  id: true,
  full_name: true,
  username: true,
  avatar: true,
  coverImage: true,
  score: true,
  week_score: true,
  month_score: true,
  currentFrame: true,
  currentEffect: true,
  createdAt: true,
};

// GET /api/user/players/search?q=... — discover public player profiles without exposing contact data.
router.get(
  '/players/search',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const query = String(req.query.q || '').trim().replace(/^@/, '').slice(0, 50);
    if (query.length < 2) return ok(res, []);

    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { full_name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: publicPlayerSelect,
      orderBy: { full_name: 'asc' },
      take: 20,
    });
    if (!users.length) return ok(res, []);

    const ids = users.map((user) => user.id);
    const [relations, presence] = await Promise.all([
      prisma.friendRequest.findMany({
        where: {
          OR: [
            { requesterId: req.user.id, recipientId: { in: ids } },
            { recipientId: req.user.id, requesterId: { in: ids } },
          ],
        },
        select: { id: true, requesterId: true, recipientId: true, status: true },
      }),
      getPresenceStatuses(ids),
    ]);
    const relationByUser = new Map();
    for (const relation of relations) {
      const otherId = relation.requesterId === req.user.id ? relation.recipientId : relation.requesterId;
      relationByUser.set(otherId, {
        relation: relation.status === 'ACCEPTED'
          ? 'friends'
          : relation.requesterId === req.user.id ? 'outgoing' : 'incoming',
        requestId: relation.id,
      });
    }

    return ok(res, users.map((user) => ({
      ...user,
      online: presence.get(user.id)?.online || false,
      currentOnlineSeconds: presence.get(user.id)?.currentOnlineSeconds || 0,
      ...relationByUser.get(user.id),
      relation: relationByUser.get(user.id)?.relation || 'none',
    })));
  }),
);

// GET /api/user/players/:id — public profile, presence and a 28-day online activity heatmap.
router.get(
  '/players/:id',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { ...publicPlayerSelect },
    });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');

    const [friendRelation, friendsCount, higherRankCount, activity] = await Promise.all([
      req.user.id === user.id ? null : prisma.friendRequest.findFirst({
        where: {
          OR: [
            { requesterId: req.user.id, recipientId: user.id },
            { requesterId: user.id, recipientId: req.user.id },
          ],
        },
        select: { id: true, requesterId: true, status: true },
      }),
      prisma.friendRequest.count({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: user.id }, { recipientId: user.id }],
        },
      }),
      prisma.user.count({ where: { score: { gt: user.score } } }),
      getOnlineActivity(user.id, 28),
    ]);

    const relation = req.user.id === user.id
      ? 'self'
      : friendRelation?.status === 'ACCEPTED'
        ? 'friends'
        : friendRelation
          ? friendRelation.requesterId === req.user.id ? 'outgoing' : 'incoming'
          : 'none';

    return ok(res, {
      ...user,
      rank: higherRankCount + 1,
      friendsCount,
      relation,
      friendRequestId: friendRelation?.id || null,
      online: activity.online,
      onlineSince: activity.onlineSince,
      lastSeenAt: activity.lastSeenAt,
      currentOnlineSeconds: activity.currentOnlineSeconds,
      activity: {
        days: activity.days,
        totalSeconds: activity.totalSeconds,
        onlineTodaySeconds: activity.onlineTodaySeconds,
      },
    });
  }),
);

// ============ MY PROFILE ============
router.get(
  '/profile',
  requireAuth('user'),
  asyncH(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        currentFrame: true,
        currentEffect: true,
        frames: { select: { frameId: true } },
        effects: { select: { effectId: true } },
      },
    });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
    const activity = await getOnlineActivity(user.id, 28);
    return ok(res, {
      id: user.id,
      full_name: user.full_name,
      avatar: user.avatar,
      coverImage: user.coverImage,
      email: user.email,
      username: user.username,
      coin: user.coin,
      score: user.score,
      week_score: user.week_score,
      month_score: user.month_score,
      currentFrame: user.currentFrame,
      currentEffect: user.currentEffect,
      ownedFrameIds: user.frames.map((frame) => frame.frameId),
      ownedEffectIds: user.effects.map((effect) => effect.effectId),
      online: activity.online,
      onlineSince: activity.onlineSince,
      lastSeenAt: activity.lastSeenAt,
      currentOnlineSeconds: activity.currentOnlineSeconds,
      activity: {
        days: activity.days,
        totalSeconds: activity.totalSeconds,
        onlineTodaySeconds: activity.onlineTodaySeconds,
      },
      createdAt: user.createdAt,
    });
  }),
);

// PATCH /api/user/profile — display name and username; media is managed by /api/upload.
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
    const user = await prisma.user.update({ where: { id: req.user.id }, data: update });
    return ok(res, { message: 'Profil yangilandi', username: user.username, full_name: user.full_name });
  }),
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
// Pagination + current player; Redis cache (30s)
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

// Group, attendance, and payment endpoints were retired from the public player API.

export default router;
