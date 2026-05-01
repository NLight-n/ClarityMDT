-- CreateTable
CREATE TABLE "hospital_settings" (
    "id" TEXT NOT NULL DEFAULT 'single',
    "name" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_settings_pkey" PRIMARY KEY ("id")
);
