-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whatsappPhone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "token" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_verifications_userId_key" ON "whatsapp_verifications"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_verifications_token_key" ON "whatsapp_verifications"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "whatsapp_verifications_userId_whatsappPhone_idx" ON "whatsapp_verifications"("userId", "whatsappPhone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "whatsapp_verifications_expiresAt_idx" ON "whatsapp_verifications"("expiresAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "whatsapp_verifications"
    ADD CONSTRAINT "whatsapp_verifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
