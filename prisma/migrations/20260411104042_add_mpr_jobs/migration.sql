-- CreateEnum
CREATE TYPE "MprJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "mpr_jobs" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "seriesInstanceUID" TEXT NOT NULL,
    "seriesDescription" TEXT,
    "status" "MprJobStatus" NOT NULL DEFAULT 'QUEUED',
    "planes" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "derivedSeriesKeys" JSONB,
    "instanceCount" INTEGER,
    "processingTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "mpr_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mpr_jobs_caseId_idx" ON "mpr_jobs"("caseId");

-- CreateIndex
CREATE INDEX "mpr_jobs_status_idx" ON "mpr_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mpr_jobs_attachmentId_seriesInstanceUID_key" ON "mpr_jobs"("attachmentId", "seriesInstanceUID");

-- AddForeignKey
ALTER TABLE "mpr_jobs" ADD CONSTRAINT "mpr_jobs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
