/**
 * HIPAA Compliance: PHI (Protected Health Information) Encryption at Rest
 * §164.312(a)(2)(iv) - Encryption and decryption mechanisms
 * 
 * This module provides field-level encryption for sensitive patient data
 * stored in the database.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment
 * Falls back to NEXTAUTH_SECRET if PHI_ENCRYPTION_KEY is not set
 */
function getEncryptionKey(): Buffer {
    const key = process.env.PHI_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;

    if (!key) {
        throw new Error("PHI_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set for PHI encryption");
    }

    // Derive a 32-byte key using SHA-256
    return createHash("sha256").update(key).digest();
}

/**
 * Encrypt PHI data
 * @param plaintext - The sensitive data to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all base64)
 */
export function encryptPHI(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined || plaintext === "") {
        return null;
    }

    try {
        const key = getEncryptionKey();
        const iv = randomBytes(IV_LENGTH);

        const cipher = createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(plaintext, "utf8", "base64");
        encrypted += cipher.final("base64");

        const authTag = cipher.getAuthTag();

        // Format: iv:authTag:ciphertext (all base64)
        return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
    } catch (error) {
        console.error("PHI encryption error:", error);
        throw new Error("Failed to encrypt PHI data");
    }
}

/**
 * Decrypt PHI data
 * @param ciphertext - The encrypted string to decrypt
 * @returns Decrypted plaintext
 */
export function decryptPHI(ciphertext: string | null | undefined): string | null {
    if (ciphertext === null || ciphertext === undefined || ciphertext === "") {
        return null;
    }

    // Check if the data is already plaintext (for migration compatibility)
    if (!ciphertext.includes(":") || ciphertext.split(":").length !== 3) {
        // Return as-is if it doesn't look like encrypted data
        // This allows gradual migration of existing data
        return ciphertext;
    }

    try {
        const key = getEncryptionKey();
        const parts = ciphertext.split(":");

        if (parts.length !== 3) {
            throw new Error("Invalid encrypted data format");
        }

        const iv = Buffer.from(parts[0], "base64");
        const authTag = Buffer.from(parts[1], "base64");
        const encrypted = parts[2];

        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, "base64", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch (error) {
        // If decryption fails, the data might be plaintext (pre-migration)
        // Log warning but return original value
        console.warn("PHI decryption failed, returning original value (may be plaintext):",
            (error as Error).message);
        return ciphertext;
    }
}

/**
 * Encrypt a JSON object containing PHI
 * @param data - JSON object to encrypt
 * @returns Encrypted string
 */
export function encryptPHIJson(data: object | null | undefined): string | null {
    if (data === null || data === undefined) {
        return null;
    }

    const jsonString = JSON.stringify(data);
    return encryptPHI(jsonString);
}

/**
 * Decrypt to a JSON object
 * @param ciphertext - Encrypted JSON string
 * @returns Parsed JSON object
 */
export function decryptPHIJson<T = object>(ciphertext: string | null | undefined): T | null {
    const decrypted = decryptPHI(ciphertext);

    if (decrypted === null) {
        return null;
    }

    try {
        return JSON.parse(decrypted) as T;
    } catch (error) {
        // If parsing fails, return the string as is (for migration compatibility)
        console.warn("PHI JSON parsing failed, data may be in old format");
        return decrypted as unknown as T;
    }
}

/**
 * Check if a string appears to be encrypted
 * Useful for gradual migration
 */
export function isEncrypted(value: string | null | undefined): boolean {
    if (!value) return false;

    const parts = value.split(":");
    if (parts.length !== 3) return false;

    // Check if parts look like base64
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    return parts.every(part => base64Regex.test(part));
}

/**
 * Encrypt PHI fields in a case object
 * Use this when creating or updating cases
 */
export interface PHIFields {
    patientName?: string | null;
    mrn?: string | null;
    clinicalDetails?: object | null;
    radiologyFindings?: object | null;
    pathologyFindings?: object | null;
}

export function encryptCasePHI(data: PHIFields): PHIFields {
    const encrypted: PHIFields = {};

    if (data.patientName !== undefined) {
        encrypted.patientName = encryptPHI(data.patientName);
    }

    if (data.mrn !== undefined) {
        encrypted.mrn = encryptPHI(data.mrn);
    }

    if (data.clinicalDetails !== undefined) {
        encrypted.clinicalDetails = data.clinicalDetails
            ? JSON.parse(encryptPHIJson(data.clinicalDetails) || "{}")
            : null;
    }

    if (data.radiologyFindings !== undefined) {
        encrypted.radiologyFindings = data.radiologyFindings
            ? JSON.parse(encryptPHIJson(data.radiologyFindings) || "{}")
            : null;
    }

    if (data.pathologyFindings !== undefined) {
        encrypted.pathologyFindings = data.pathologyFindings
            ? JSON.parse(encryptPHIJson(data.pathologyFindings) || "{}")
            : null;
    }

    return encrypted;
}

/**
 * Decrypt PHI fields from a case object
 * Use this when reading cases from database
 */
export function decryptCasePHI<T extends PHIFields>(caseData: T): T {
    const decrypted = { ...caseData };

    if (typeof caseData.patientName === "string") {
        decrypted.patientName = decryptPHI(caseData.patientName);
    }

    if (typeof caseData.mrn === "string") {
        decrypted.mrn = decryptPHI(caseData.mrn);
    }

    // JSON fields are handled specially - they may be stored as encrypted strings
    // or as regular JSON objects depending on migration status

    return decrypted;
}
