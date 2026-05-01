-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "followUp" TEXT,
ADD COLUMN     "links" JSONB DEFAULT '[]';
