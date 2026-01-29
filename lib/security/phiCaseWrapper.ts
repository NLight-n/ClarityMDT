/**
 * HIPAA Compliance: PHI Encryption Wrapper for Prisma Case Operations
 * 
 * This module provides encryption/decryption wrappers for case CRUD operations.
 * It can be enabled via the ENABLE_PHI_ENCRYPTION environment variable.
 * 
 * When enabled, sensitive patient fields are encrypted before storage
 * and decrypted when retrieved.
 */

import { encryptPHI, decryptPHI } from "./phiEncryption";

// Check if PHI encryption is enabled
export function isPhiEncryptionEnabled(): boolean {
    return process.env.ENABLE_PHI_ENCRYPTION === "true";
}

/**
 * Sensitive fields that contain PHI and should be encrypted
 */
const PHI_STRING_FIELDS = ["patientName", "mrn"] as const;

/**
 * Type for case data with PHI fields
 */
interface CaseDataWithPHI {
    patientName?: string | null;
    mrn?: string | null;
    [key: string]: unknown;
}

/**
 * Encrypt PHI fields in case data before saving to database
 * Only encrypts if ENABLE_PHI_ENCRYPTION=true
 */
export function encryptCaseData<T extends CaseDataWithPHI>(data: T): T {
    if (!isPhiEncryptionEnabled()) {
        return data;
    }

    const encrypted = { ...data };

    for (const field of PHI_STRING_FIELDS) {
        if (field in data && typeof data[field] === "string") {
            encrypted[field] = encryptPHI(data[field] as string) as T[typeof field];
        }
    }

    return encrypted;
}

/**
 * Decrypt PHI fields in case data after retrieving from database
 * Handles both encrypted and plaintext data (for migration compatibility)
 */
export function decryptCaseData<T extends CaseDataWithPHI>(data: T | null): T | null {
    if (!data) {
        return null;
    }

    // If encryption is not enabled, still try to decrypt in case data was encrypted previously
    // This ensures data encrypted before disabling remains readable

    const decrypted = { ...data };

    for (const field of PHI_STRING_FIELDS) {
        if (field in data && typeof data[field] === "string") {
            decrypted[field] = decryptPHI(data[field] as string) as T[typeof field];
        }
    }

    return decrypted;
}

/**
 * Decrypt an array of case data
 */
export function decryptCaseDataArray<T extends CaseDataWithPHI>(dataArray: T[]): T[] {
    return dataArray.map(data => decryptCaseData(data)!);
}

/**
 * Encrypt/decrypt helper for search operations
 * When encryption is enabled, we need to handle search differently
 * 
 * This returns a function that can be used to check if a decrypted value matches
 */
export function createPHISearchMatcher(searchTerm: string): (encryptedValue: string | null) => boolean {
    const lowerSearchTerm = searchTerm.toLowerCase();

    return (encryptedValue: string | null) => {
        if (!encryptedValue) return false;

        // Decrypt the value and check if it contains the search term
        const decrypted = decryptPHI(encryptedValue);
        if (!decrypted) return false;

        return decrypted.toLowerCase().includes(lowerSearchTerm);
    };
}

/**
 * Utility to check if a value appears to be encrypted
 * Used for migration and backward compatibility
 */
export function isValueEncrypted(value: string | null | undefined): boolean {
    if (!value) return false;

    const parts = value.split(":");
    if (parts.length !== 3) return false;

    // Check if parts look like base64
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    return parts.every(part => base64Regex.test(part));
}

/**
 * Migration helper: Encrypt all plaintext PHI in existing cases
 * This should be run as a one-time migration when enabling encryption
 */
export async function migrateExistingCasesToEncrypted(prisma: any): Promise<{ migrated: number; errors: number }> {
    if (!isPhiEncryptionEnabled()) {
        throw new Error("PHI encryption is not enabled. Set ENABLE_PHI_ENCRYPTION=true first.");
    }

    let migrated = 0;
    let errors = 0;

    const cases = await prisma.case.findMany({
        select: {
            id: true,
            patientName: true,
            mrn: true,
        },
    });

    for (const caseRecord of cases) {
        try {
            const updates: Record<string, string | null> = {};
            let needsUpdate = false;

            // Check each PHI field
            if (caseRecord.patientName && !isValueEncrypted(caseRecord.patientName)) {
                updates.patientName = encryptPHI(caseRecord.patientName);
                needsUpdate = true;
            }

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
            }
        } catch (error) {
            console.error(`Error migrating case ${caseRecord.id}:`, error);
            errors++;
        }
    }

    return { migrated, errors };
}
