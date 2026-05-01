-- Reconcile prior drift and add new field safely (no reset)
ALTER TABLE "CaseAttachment" ADD COLUMN IF NOT EXISTS "isDicomBundle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappConsentDate" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "concernedDepartmentIds" JSONB;
