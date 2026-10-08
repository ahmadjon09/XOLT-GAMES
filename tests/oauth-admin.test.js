import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionAllowlistedAdmin } from '../server/src/services/oauthAdmin.js';

test('allowlisted OAuth sign-in cannot reactivate a disabled admin via another provider', async () => {
  const db = {
    staff: {
      upsert: async ({ where, update, create }) => {
        assert.equal(where.email, 'admin@example.com');
        assert.equal(update.active, undefined);
        assert.equal(create.active, true);
        return { id: 'disabled-admin', active: false };
      },
    },
  };

  await assert.rejects(
    provisionAllowlistedAdmin(db, { email: 'admin@example.com', name: 'Admin' }),
    (error) => error.status === 403 && error.code === 'ACCOUNT_DISABLED',
  );
});

test('new allowlisted admin can be provisioned without re-enabling existing accounts', async () => {
  const db = {
    staff: {
      upsert: async ({ create }) => ({ id: 'new-admin', ...create }),
    },
  };
  const staff = await provisionAllowlistedAdmin(db, { email: 'new@example.com', name: 'New Admin' });
  assert.equal(staff.active, true);
  assert.equal(staff.role, 'ADMIN');
});
