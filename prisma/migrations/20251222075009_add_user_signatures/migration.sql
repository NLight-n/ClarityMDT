-- AlterTable
ALTER TABLE "User" ADD COLUMN     "signatureAuthenticated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signatureUrl" TEXT;
