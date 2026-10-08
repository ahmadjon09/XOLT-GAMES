import { ApiError } from '../utils/response.js';

// A second OAuth provider must never undo an administrator's deactivation.
// The upsert is atomic, but its update branch intentionally leaves active alone.
export async function provisionAllowlistedAdmin(db, profile) {
  const staff = await db.staff.upsert({
    where: { email: profile.email },
    update: { full_name: profile.name, role: 'ADMIN' },
    create: {
      full_name: profile.name,
      email: profile.email,
      phone: null,
      password: null,
      role: 'ADMIN',
      active: true,
    },
  });
  if (!staff.active) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Admin hisobi faolsizlantirilgan');
  return staff;
}
