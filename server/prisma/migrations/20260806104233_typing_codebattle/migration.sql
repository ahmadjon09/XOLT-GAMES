-- CreateTable
CREATE TABLE "TypingText" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'uz',
    "content" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'easy',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypingText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypingRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "duration" INTEGER NOT NULL,
    "chars" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'solo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeQuestion" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'js',
    "code" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "timeLimit" INTEGER NOT NULL DEFAULT 20,
    "points" INTEGER NOT NULL DEFAULT 1000,
    "createdById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TypingText_lang_idx" ON "TypingText"("lang");

-- CreateIndex
CREATE INDEX "TypingRecord_createdAt_idx" ON "TypingRecord"("createdAt");

-- CreateIndex
CREATE INDEX "TypingRecord_userId_idx" ON "TypingRecord"("userId");

-- CreateIndex
CREATE INDEX "CodeQuestion_category_idx" ON "CodeQuestion"("category");

-- AddForeignKey
ALTER TABLE "TypingText" ADD CONSTRAINT "TypingText_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypingRecord" ADD CONSTRAINT "TypingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeQuestion" ADD CONSTRAINT "CodeQuestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
