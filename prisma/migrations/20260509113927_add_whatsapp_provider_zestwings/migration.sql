-- CreateEnum
CREATE TYPE "WhatsappProvider" AS ENUM ('META', 'ZESTWINGS');

-- AlterTable
ALTER TABLE "whatsapp_settings" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "provider" "WhatsappProvider" NOT NULL DEFAULT 'META',
ADD COLUMN     "wabaNumber" TEXT;
