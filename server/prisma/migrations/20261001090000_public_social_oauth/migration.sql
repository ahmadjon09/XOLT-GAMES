-- Public XOLT Games platform: OAuth-only public accounts, friends, user quizzes and game catalog.
-- Legacy phone/group records are retained for a non-destructive migration.

ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "email" TEXT;

ALTER TABLE "Staff" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "Staff" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "Staff" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

ALTER TABLE "Quiz" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Quiz" DROP CONSTRAINT "Quiz_createdById_fkey";
ALTER TABLE "Quiz" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Quiz" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Quiz" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Quiz_createdByUserId_idx" ON "Quiz"("createdByUserId");
CREATE INDEX "Quiz_active_isPublic_idx" ON "Quiz"("active", "isPublic");

CREATE TABLE "OAuthAccount" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "email" TEXT,
  "userId" TEXT,
  "staffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OAuthAccount_single_owner_check" CHECK (("userId" IS NOT NULL) <> ("staffId" IS NOT NULL)),
  CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OAuthAccount_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");
CREATE INDEX "OAuthAccount_staffId_idx" ON "OAuthAccount"("staffId");

CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED');
CREATE TABLE "FriendRequest" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FriendRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FriendRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FriendRequest_not_self_check" CHECK ("requesterId" <> "recipientId")
);
CREATE UNIQUE INDEX "FriendRequest_requesterId_recipientId_key" ON "FriendRequest"("requesterId", "recipientId");
CREATE INDEX "FriendRequest_recipientId_status_createdAt_idx" ON "FriendRequest"("recipientId", "status", "createdAt");
CREATE INDEX "FriendRequest_requesterId_status_createdAt_idx" ON "FriendRequest"("requesterId", "status", "createdAt");

CREATE TABLE "GameCatalog" (
  "id" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameCatalog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GameCatalog_active_sortOrder_idx" ON "GameCatalog"("active", "sortOrder");
