import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption/crypto";

/**
 * Get WhatsApp settings from database and decrypt access token
 * Returns null if WhatsApp is not enabled or not configured
 */
export async function getWhatsappSettings(): Promise<{
  enabled: boolean;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  accessToken: string | null;
} | null> {
  try {
    const settings = await prisma.whatsappSettings.findUnique({
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
    let accessToken: string | null = null;
    if (settings.accessToken) {
      try {
        accessToken = decrypt(settings.accessToken, encryptionKey);
      } catch (error) {
        console.error("Error decrypting WhatsApp access token:", error);
        return null;
      }
    }

    return {
      enabled: settings.enabled,
      phoneNumberId: settings.phoneNumberId,
      businessAccountId: settings.businessAccountId,
      accessToken: accessToken,
    };
  } catch (error) {
    console.error("Error fetching WhatsApp settings:", error);
    return null;
  }
}
