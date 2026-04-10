/**
 * Two-Factor Authentication (2FA) Module
 * 
 * Provides 2FA via Telegram or WhatsApp for users who have linked their accounts.
 */

import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";
import { sendWhatsappTemplateMessage } from "@/lib/whatsapp/sendMessage";
import { getWhatsappSettings } from "@/lib/whatsapp/getSettings";
import { WhatsappTemplateStatus } from "@prisma/client";
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
 * Send 2FA code via WhatsApp using an AUTHENTICATION template
 */
async function sendCodeViaWhatsapp(whatsappPhone: string, code: string): Promise<boolean> {
    try {
        const whatsappSettings = await getWhatsappSettings();
        if (!whatsappSettings?.enabled) {
            return false;
        }

        // Find an approved AUTHENTICATION template for 2FA
        const template = await prisma.whatsappTemplate.findFirst({
            where: {
                category: "AUTHENTICATION",
                status: WhatsappTemplateStatus.APPROVED,
            },
        });

        if (!template) {
            console.error("No approved AUTHENTICATION template for WhatsApp 2FA");
            return false;
        }

        await sendWhatsappTemplateMessage(
            whatsappPhone,
            template.name,
            template.language,
            [
                {
                    type: "body",
                    parameters: [
                        { type: "text" as const, text: code },
                    ],
                },
            ]
        );
        return true;
    } catch (error) {
        console.error("Failed to send 2FA code via WhatsApp:", error);
        return false;
    }
}

/**
 * Create and send a 2FA code to the user via their preferred channel
 * @param userId - The user's ID
 * @returns The created code details or throws error
 */
export async function createAndSendTwoFactorCode(userId: string): Promise<{ success: boolean; expiresAt: Date; channel: string }> {
    // Get the user with their notification settings
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            telegramId: true,
            whatsappPhone: true,
            twoFactorEnabled: true,
            preferredTwoFactorChannel: true,
        },
    });

    if (!user) {
        throw new Error("User not found");
    }

    if (!user.telegramId && !user.whatsappPhone) {
        throw new Error("No notification channel linked (Telegram or WhatsApp)");
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

    // Determine which channel to use
    let channelUsed = "telegram";
    let sent = false;

    if (user.preferredTwoFactorChannel === "WHATSAPP" && user.whatsappPhone) {
        // Try WhatsApp first
        sent = await sendCodeViaWhatsapp(user.whatsappPhone, code);
        if (sent) {
            channelUsed = "whatsapp";
        } else if (user.telegramId) {
            // Fallback to Telegram
            const message = `🔐 *ClarityMDT Login Verification*\n\nYour verification code is:\n\n*${code}*\n\nThis code expires in ${CODE_EXPIRY_MINUTES} minutes.\n\n⚠️ If you didn't request this code, please secure your account immediately.`;
            try {
                await sendTelegramMessage({
                    chatId: user.telegramId,
                    text: message,
                    parseMode: "Markdown",
                });
                sent = true;
                channelUsed = "telegram";
            } catch (error) {
                console.error("Failed to send 2FA code via Telegram (fallback):", error);
            }
        }
    } else if (user.telegramId) {
        // Use Telegram (default)
        const message = `🔐 *ClarityMDT Login Verification*\n\nYour verification code is:\n\n*${code}*\n\nThis code expires in ${CODE_EXPIRY_MINUTES} minutes.\n\n⚠️ If you didn't request this code, please secure your account immediately.`;
        try {
            await sendTelegramMessage({
                chatId: user.telegramId,
                text: message,
                parseMode: "Markdown",
            });
            sent = true;
            channelUsed = "telegram";
        } catch (error) {
            console.error("Failed to send 2FA code via Telegram:", error);
            // Fallback to WhatsApp
            if (user.whatsappPhone) {
                sent = await sendCodeViaWhatsapp(user.whatsappPhone, code);
                if (sent) {
                    channelUsed = "whatsapp";
                }
            }
        }
    } else if (user.whatsappPhone) {
        // Only WhatsApp available
        sent = await sendCodeViaWhatsapp(user.whatsappPhone, code);
        if (sent) {
            channelUsed = "whatsapp";
        }
    }

    if (!sent) {
        throw new Error("Failed to send verification code. Please try again.");
    }

    return { success: true, expiresAt, channel: channelUsed };
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
    channel: string;
}> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            telegramId: true,
            whatsappPhone: true,
            twoFactorEnabled: true,
            preferredTwoFactorChannel: true,
        },
    });

    if (!user) {
        return { enabled: false, configured: false, channel: "telegram" };
    }

    const hasAnyChannel = !!user.telegramId || !!user.whatsappPhone;

    return {
        enabled: user.twoFactorEnabled && hasAnyChannel,
        configured: hasAnyChannel,
        channel: user.preferredTwoFactorChannel || "TELEGRAM",
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
        select: { telegramId: true, whatsappPhone: true },
    });

    if (!user) {
        throw new Error("User not found");
    }

    // Can only enable 2FA if at least one channel is linked
    if (enabled && !user.telegramId && !user.whatsappPhone) {
        throw new Error("Cannot enable 2FA without a linked Telegram or WhatsApp account");
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

