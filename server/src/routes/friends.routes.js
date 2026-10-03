import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { getOnlineIds, getPresenceStatuses, createGameInvite, getPendingGameInvites, respondToGameInvite } from '../mongo/runtimeStore.js';
import { getSocketServer } from '../socket/runtime.js';
import { isGameActive } from '../services/gameCatalog.js';

const router = Router();
router.use(requireAuth('user'));

const friendSelect = {
  id: true,
  full_name: true,
  avatar: true,
  coverImage: true,
  username: true,
  currentFrame: true,
  currentEffect: true,
};

const requestSelect = {
  id: true,
  requesterId: true,
  recipientId: true,
  status: true,
  createdAt: true,
  requester: { select: friendSelect },
  recipient: { select: friendSelect },
};

const getFriendRequestBetween = (userId, otherId) => prisma.friendRequest.findFirst({
  where: {
    OR: [
      { requesterId: userId, recipientId: otherId },
      { requesterId: otherId, recipientId: userId },
    ],
  },
  select: { id: true, requesterId: true, recipientId: true, status: true },
});

// GET /api/user/friends — friend list, requests and pending online game invites.
router.get('/', asyncH(async (req, res) => {
  const userId = req.user.id;
  const relations = await prisma.friendRequest.findMany({
    where: {
      OR: [{ requesterId: userId }, { recipientId: userId }],
    },
    select: requestSelect,
    orderBy: { createdAt: 'desc' },
  });

  const accepted = relations.filter((relation) => relation.status === 'ACCEPTED');
  const friends = accepted.map((relation) =>
    relation.requesterId === userId ? relation.recipient : relation.requester,
  );
  const incomingRequests = relations
    .filter((relation) => relation.status === 'PENDING' && relation.recipientId === userId)
    .map((relation) => ({ id: relation.id, user: relation.requester, createdAt: relation.createdAt }));
  const outgoingRequests = relations
    .filter((relation) => relation.status === 'PENDING' && relation.requesterId === userId)
    .map((relation) => ({ id: relation.id, user: relation.recipient, createdAt: relation.createdAt }));

  const [presence, pendingInvites] = await Promise.all([
    getPresenceStatuses(friends.map((friend) => friend.id)),
    getPendingGameInvites(userId),
  ]);
  const friendsById = new Map(friends.map((friend) => [friend.id, friend]));

  return ok(res, {
    friends: friends.map((friend) => ({
      ...friend,
      online: presence.get(friend.id)?.online || false,
      onlineSince: presence.get(friend.id)?.onlineSince || null,
      currentOnlineSeconds: presence.get(friend.id)?.currentOnlineSeconds || 0,
    })),
    incomingRequests,
    outgoingRequests,
    incomingGameInvites: pendingInvites.map((invite) => ({
      ...invite,
      from: friendsById.get(invite.fromUserId) || null,
    })),
  });
}));

// POST /api/user/friends/requests — send a friend request by user ID.
router.post('/requests', asyncH(async (req, res) => {
  const { userId: targetId } = z.object({ userId: z.string().min(1) }).parse(req.body);
  if (targetId === req.user.id) throw new ApiError(400, 'FRIEND_SELF', 'O\'zingizga so\'rov yubora olmaysiz');
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: friendSelect });
  if (!target) throw new ApiError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');

  const existing = await getFriendRequestBetween(req.user.id, targetId);
  if (existing?.status === 'ACCEPTED') throw new ApiError(409, 'ALREADY_FRIENDS', 'Bu foydalanuvchi allaqachon do\'stingiz');
  if (existing) {
    if (existing.requesterId === targetId) throw new ApiError(409, 'FRIEND_REQUEST_INCOMING', 'Sizga kelgan do\'stlik so\'rovini qabul qiling');
    throw new ApiError(409, 'FRIEND_REQUEST_EXISTS', 'So\'rov allaqachon yuborilgan');
  }

  const request = await prisma.friendRequest.create({
    data: { requesterId: req.user.id, recipientId: targetId },
    select: { id: true, createdAt: true },
  });
  const io = getSocketServer();
  io?.to(`user:${targetId}`).emit('friend:request', {
    id: request.id,
    createdAt: request.createdAt,
    user: {
      id: req.user.id,
      full_name: req.user.full_name,
      avatar: req.user.db.avatar,
      username: req.user.db.username,
    },
  });
  return ok(res, { id: request.id, user: target, createdAt: request.createdAt }, { message: 'Do\'stlik so\'rovi yuborildi' });
}));

// POST /api/user/friends/requests/:id/respond — accept or decline an incoming request.
router.post('/requests/:id/respond', asyncH(async (req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id }, select: requestSelect });
  if (!request || request.recipientId !== req.user.id || request.status !== 'PENDING') {
    throw new ApiError(404, 'FRIEND_REQUEST_NOT_FOUND', 'So\'rov topilmadi yoki muddati tugagan');
  }

  if (accept) {
    await prisma.friendRequest.update({ where: { id: request.id }, data: { status: 'ACCEPTED' } });
  } else {
    await prisma.friendRequest.delete({ where: { id: request.id } });
  }

  const io = getSocketServer();
  io?.to(`user:${request.requesterId}`).emit(accept ? 'friend:request_accepted' : 'friend:request_declined', {
    requestId: request.id,
    userId: req.user.id,
    full_name: req.user.full_name,
  });
  return ok(res, { accepted: accept }, { message: accept ? 'Do\'stlik so\'rovi qabul qilindi' : 'So\'rov rad etildi' });
}));

// DELETE /api/user/friends/:friendId — remove an accepted friendship in either direction.
router.delete('/:friendId', asyncH(async (req, res) => {
  const relation = await getFriendRequestBetween(req.user.id, req.params.friendId);
  if (!relation || relation.status !== 'ACCEPTED') throw new ApiError(404, 'NOT_FOUND', 'Do\'st topilmadi');
  await prisma.friendRequest.delete({ where: { id: relation.id } });
  return ok(res, { removed: true });
}));

// POST /api/user/friends/:friendId/invites — online friends only.
router.post('/:friendId/invites', asyncH(async (req, res) => {
  const { gameType } = z.object({
    gameType: z.enum(['math', 'quiz', 'tictactoe', 'chess', 'checkers', 'typerace', 'codebattle']),
  }).parse(req.body);
  const friendId = req.params.friendId;
  const relation = await getFriendRequestBetween(req.user.id, friendId);
  if (!relation || relation.status !== 'ACCEPTED') throw new ApiError(403, 'NOT_FRIENDS', 'Faqat do\'stlaringizni taklif qila olasiz');
  if (!(await isGameActive(gameType))) throw new ApiError(409, 'GAME_DISABLED', 'Bu o\'yin hozircha mavjud emas');
  if (!(await getOnlineIds([friendId])).has(friendId)) throw new ApiError(409, 'FRIEND_OFFLINE', 'O\'yinga taklif yuborish uchun do\'st onlayn bo\'lishi kerak');

  const invite = await createGameInvite({ fromUserId: req.user.id, toUserId: friendId, gameType });
  const from = {
    id: req.user.id,
    full_name: req.user.full_name,
    avatar: req.user.db.avatar,
    username: req.user.db.username,
  };
  getSocketServer()?.to(`user:${friendId}`).emit('friend:game_invite', { ...invite, from });
  return ok(res, invite, { message: 'O\'yin taklifi yuborildi' });
}));

// POST /api/user/friends/invites/:id/respond — game invite accept/decline.
router.post('/invites/:id/respond', asyncH(async (req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  const invite = await respondToGameInvite({ inviteId: req.params.id, userId: req.user.id, accept });
  if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', 'Taklif topilmadi yoki muddati tugagan');
  const io = getSocketServer();
  io?.to(`user:${invite.fromUserId}`).emit('friend:invite_response', {
    inviteId: invite.id,
    userId: req.user.id,
    status: invite.status,
    gameType: invite.gameType,
  });
  return ok(res, invite);
}));

export default router;
