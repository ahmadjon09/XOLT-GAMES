-- Retire the teacher account role without deleting linked staff or historical groups.
-- Former teacher accounts are demoted to the remaining cashier role; group records stay untouched.
UPDATE "Staff" SET "role" = 'CASHIER' WHERE "role" = 'TEACHER';

ALTER TYPE "Role" RENAME TO "Role_legacy";
CREATE TYPE "Role" AS ENUM ('CASHIER', 'ADMIN');

ALTER TABLE "Staff" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Staff"
  ALTER COLUMN "role" TYPE "Role"
  USING ("role"::text::"Role");
ALTER TABLE "Staff" ALTER COLUMN "role" SET DEFAULT 'CASHIER';

DROP TYPE "Role_legacy";
