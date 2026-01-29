/**
 * Two-Factor Authentication (2FA) Module
 * 
 * Provides 2FA via Telegram for users who have linked their accounts.
 */

import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";
import { randomInt } from "crypto";

const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 5;

/**
 * Generate a random 6-digit code
 */
function generateCode(): string {
    const min = Math.pow(10, CODE_LENGTH - 1);
    const max = Math.pow(10, CODE_LENGTH) - 1;
    return randomInt(min, max + 1).toString();
}

/**
 * Create and send a 2FA code to the user via Telegram
 * @param userId - The user's ID
 * @returns The created code (for testing) or throws error
 */
export async function createAndSendTwoFactorCode(userId: string): Promise<{ success: boolean; expiresAt: Date }> {
    // Get the user with their Telegram ID
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            telegramId: true,
            twoFactorEnabled: true,
        },
    });

    if (!user) {
        throw new Error("User not found");
    }

    if (!user.telegramId) {
        throw new Error("Telegram account not linked");
    }

    if (!user.twoFactorEnabled) {
        throw new Error("Two-factor authentication is not enabled");
    }

    // Generate a new code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate any existing codes for this user
    await prisma.twoFactorCode.updateMany({
        where: {
            userId: user.id,
            used: false,
            expiresAt: { gt: new Date() },
        },
        data: {
            used: true,
        },
    });

    // Create the new code
    await prisma.twoFactorCode.create({
        data: {
            userId: user.id,
            code,
            expiresAt,
        },
    });

    // Send the code via Telegram
    const message = `🔐 *ClarityMDT Login Verification*\n\nYour verification code is:\n\n*${code}*\n\nThis code expires in ${CODE_EXPIRY_MINUTES} minutes.\n\n⚠️ If you didn't request this code, please secure your account immediately.`;

    try {
        await sendTelegramMessage({
            chatId: user.telegramId,
            text: message,
            parseMode: "Markdown",
        });
    } catch (error) {
        console.error("Failed to send 2FA code via Telegram:", error);
        throw new Error("Failed to send verification code. Please try again.");
    }

    return { success: true, expiresAt };
}

/**
 * Verify a 2FA code
 * @param userId - The user's ID
 * @param code - The code to verify
 * @returns True if valid, false otherwise
 */
export async function verifyTwoFactorCode(userId: string, code: string): Promise<boolean> {
    const twoFactorCode = await prisma.twoFactorCode.findFirst({
        where: {
            userId,
            code,
            used: false,
            expiresAt: { gt: new Date() },
        },
    });

    if (!twoFactorCode) {
        return false;
    }

    // Mark the code as used
    await prisma.twoFactorCode.update({
        where: { id: twoFactorCode.id },
        data: { used: true },
    });

    return true;
}

/**
 * Check if a user has 2FA enabled and configured
 * @param userId - The user's ID
 * @returns Object with 2FA status
 */
export async function getTwoFactorStatus(userId: string): Promise<{
    enabled: boolean;
    configured: boolean;
}> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            telegramId: true,
            twoFactorEnabled: true,
        },
    });

    if (!user) {
        return { enabled: false, configured: false };
    }

    return {
        enabled: user.twoFactorEnabled && !!user.telegramId,
        configured: !!user.telegramId,
    };
}

/**
 * Enable or disable 2FA for a user
 * @param userId - The user's ID
 * @param enabled - Whether to enable or disable 2FA
 * @returns Updated user data
 */
export async function setTwoFactorEnabled(userId: string, enabled: boolean): Promise<{ twoFactorEnabled: boolean }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true },
    });

    if (!user) {
        throw new Error("User not found");
    }

    // Can only enable 2FA if Telegram is linked
    if (enabled && !user.telegramId) {
        throw new Error("Cannot enable 2FA without a linked Telegram account");
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: enabled },
        select: { twoFactorEnabled: true },
    });

    return updated;
}

/**
 * Cleanup expired 2FA codes (call periodically)
 */
export async function cleanupExpiredCodes(): Promise<number> {
    const result = await prisma.twoFactorCode.deleteMany({
        where: {
            OR: [
                { expiresAt: { lt: new Date() } },
                { used: true },
            ],
        },
    });

    return result.count;
}
