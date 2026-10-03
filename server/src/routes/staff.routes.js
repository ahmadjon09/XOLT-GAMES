// Employee profile endpoints. Teacher/group/attendance/payment modules have been retired.
import { Router } from 'express';
import { z } from 'zod';
import { ok, ApiError, asyncH } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

const router = Router();
router.use(requireAuth('staff'));

router.get('/profile', asyncH(async (req, res) => {
  const staff = await prisma.staff.findUnique({
    where: { id: req.user.id },
    select: { id: true, full_name: true, email: true, avatar: true, role: true, createdAt: true },
  });
  if (!staff) throw new ApiError(404, 'NOT_FOUND', 'Admin topilmadi');
  return ok(res, staff);
}));

router.patch('/profile', asyncH(async (req, res) => {
  const { full_name: fullName } = z.object({
    full_name: z.string().trim().min(3, 'Ism kamida 3 belgi').max(60).optional(),
  }).parse(req.body);
  if (fullName === undefined) return ok(res, { message: 'Hech narsa o\'zgarmadi' });
  const staff = await prisma.staff.update({
    where: { id: req.user.id },
    data: { full_name: fullName },
    select: { id: true, full_name: true, email: true, avatar: true, role: true, createdAt: true },
  });
  return ok(res, staff, { message: 'Profil yangilandi' });
}));

export default router;
