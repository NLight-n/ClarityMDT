-- CreateTable
CREATE TABLE "telegram_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_verifications_userId_key" ON "telegram_verifications"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_verifications_code_key" ON "telegram_verifications"("code");

-- AddForeignKey
ALTER TABLE "telegram_verifications" ADD CONSTRAINT "telegram_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
