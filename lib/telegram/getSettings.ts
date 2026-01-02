import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption/crypto";

/**
 * Get Telegram settings from database and decrypt token
 * Returns null if Telegram is not enabled or not configured
 */
export async function getTelegramSettings(): Promise<{
  enabled: boolean;
  botName: string | null;
  botToken: string | null;
  qrCodeUrl: string | null;
} | null> {
  try {
    const settings = await prisma.telegramSettings.findUnique({
      where: { id: "single" },
    });

    if (!settings || !settings.enabled) {
      return null;
    }

    // Get encryption key
    const encryptionKey = process.env.NEXTAUTH_SECRET;
    if (!encryptionKey) {
      console.error("NEXTAUTH_SECRET not configured");
      return null;
    }

    // Decrypt token if present
    let botToken: string | null = null;
    if (settings.botToken) {
      try {
        botToken = decrypt(settings.botToken, encryptionKey);
      } catch (error) {
        console.error("Error decrypting Telegram bot token:", error);
        return null;
      }
    }

    return {
      enabled: settings.enabled,
      botName: settings.botName,
      botToken: botToken,
      qrCodeUrl: settings.qrCodeUrl,
    };
  } catch (error) {
    console.error("Error fetching Telegram settings:", error);
    return null;
  }
}

