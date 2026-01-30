/**
 * HIPAA Compliance: PHI Encryption Migration Script
 * 
 * This script migrates existing case data to encrypted format.
 * Run this script AFTER enabling ENABLE_PHI_ENCRYPTION=true in your .env file.
 * 
 * Usage:
 *   npx ts-node --project scripts/tsconfig.scripts.json scripts/migrate-phi-encryption.ts
 *   
 * Or with npm scripts:
 *   npm run migrate:phi
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { createHash, createCipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
    const key = process.env.PHI_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;

    if (!key) {
        throw new Error("PHI_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set");
    }

    return createHash("sha256").update(key).digest();
}

function encryptPHI(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

function isValueEncrypted(value: string | null | undefined): boolean {
    if (!value) return false;

    const parts = value.split(":");
    if (parts.length !== 3) return false;

    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    return parts.every(part => base64Regex.test(part));
}

async function migrateExistingCases(): Promise<void> {
    console.log("🔐 PHI Encryption Migration Script");
    console.log("===================================\n");

    // Check if encryption is enabled
    if (process.env.ENABLE_PHI_ENCRYPTION !== "true") {
        console.error("❌ Error: ENABLE_PHI_ENCRYPTION is not set to 'true'");
        console.log("   Please set ENABLE_PHI_ENCRYPTION=true in your .env file first.\n");
        process.exit(1);
    }

    console.log("📊 Fetching all cases from database...\n");

    const cases = await prisma.case.findMany({
        select: {
            id: true,
            patientName: true,
            mrn: true,
        },
    });

    console.log(`   Found ${cases.length} cases to process.\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const caseRecord of cases) {
        try {
            const updates: Record<string, string | null> = {};
            let needsUpdate = false;

            // Check patientName
            if (caseRecord.patientName && !isValueEncrypted(caseRecord.patientName)) {
                updates.patientName = encryptPHI(caseRecord.patientName);
                needsUpdate = true;
            }

            // Check MRN
            if (caseRecord.mrn && !isValueEncrypted(caseRecord.mrn)) {
                updates.mrn = encryptPHI(caseRecord.mrn);
                needsUpdate = true;
            }

            if (needsUpdate) {
                await prisma.case.update({
                    where: { id: caseRecord.id },
                    data: updates,
                });
                migrated++;
                process.stdout.write(`   ✓ Migrated case ${caseRecord.id}\n`);
            } else {
                skipped++;
            }
        } catch (error) {
            console.error(`   ✗ Error migrating case ${caseRecord.id}:`, error);
            errors++;
        }
    }

    console.log("\n===================================");
    console.log("📈 Migration Summary:");
    console.log(`   ✓ Migrated: ${migrated}`);
    console.log(`   ⊘ Skipped (already encrypted): ${skipped}`);
    console.log(`   ✗ Errors: ${errors}`);
    console.log("===================================\n");

    if (errors > 0) {
        console.log("⚠️  Some cases failed to migrate. Please review the errors above.");
        process.exit(1);
    }

    console.log("✅ PHI encryption migration completed successfully!\n");
}

// Run the migration
migrateExistingCases()
    .catch((error) => {
        console.error("Migration failed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
