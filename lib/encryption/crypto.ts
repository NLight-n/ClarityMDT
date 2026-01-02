import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encrypt data using AES-256-GCM
 * @param text - Plain text to encrypt
 * @param key - Encryption key (should be NEXTAUTH_SECRET)
 * @returns Encrypted string in format: iv:authTag:encryptedData (all base64)
 */
export function encrypt(text: string, key: string): string {
  const algorithm = "aes-256-gcm";
  const iv = randomBytes(16);
  
  // Derive a 32-byte key from the provided key using SHA-256
  const crypto = require("crypto");
  const keyBuffer = crypto.createHash("sha256").update(key).digest();
  
  const cipher = createCipheriv(algorithm, keyBuffer, iv);
  
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  // Return format: iv:authTag:encryptedData (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt data using AES-256-GCM
 * @param encryptedText - Encrypted string in format: iv:authTag:encryptedData
 * @param key - Encryption key (should be NEXTAUTH_SECRET)
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string, key: string): string {
  const algorithm = "aes-256-gcm";
  
  // Parse the encrypted string
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }
  
  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const encrypted = parts[2];
  
  // Derive a 32-byte key from the provided key using SHA-256
  const crypto = require("crypto");
  const keyBuffer = crypto.createHash("sha256").update(key).digest();
  
  const decipher = createDecipheriv(algorithm, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

/**
 * Mask sensitive data for display (shows first 4 and last 4 characters)
 * @param text - Text to mask
 * @returns Masked string
 */
export function maskSensitiveData(text: string | null | undefined): string {
  if (!text || text.length <= 8) {
    return "****";
  }
  const start = text.substring(0, 4);
  const end = text.substring(text.length - 4);
  const middle = "*".repeat(Math.min(text.length - 8, 12));
  return `${start}${middle}${end}`;
}

