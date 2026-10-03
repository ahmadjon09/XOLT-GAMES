-- Add public profile cover imagery and retire cashier plus both racing games.
ALTER TABLE "User" ADD COLUMN "coverImage" TEXT;

-- Keep legacy attribution rows, but disable all former cashier accounts before
-- removing their role so those identities cannot acquire admin access.
UPDATE "Staff" SET "active" = false, "role" = 'ADMIN' WHERE "role" = 'CASHIER';

ALTER TYPE "Role" RENAME TO "Role_legacy";
CREATE TYPE "Role" AS ENUM ('ADMIN');
ALTER TABLE "Staff" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Staff"
  ALTER COLUMN "role" TYPE "Role"
  USING ("role"::text::"Role");
ALTER TABLE "Staff" ALTER COLUMN "role" SET DEFAULT 'ADMIN';
DROP TYPE "Role_legacy";

-- Remove the retired 2D/3D racing entries from the existing playable catalog.
DELETE FROM "GameCatalog" WHERE "id" IN ('race', 'race3d');
