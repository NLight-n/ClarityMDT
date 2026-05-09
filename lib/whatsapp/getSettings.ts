import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption/crypto";

export type WhatsappProvider = "META" | "ZESTWINGS";

export interface WhatsappSettingsResult {
  enabled: boolean;
  provider: WhatsappProvider;
  // Meta fields
  phoneNumberId: string | null;
  businessAccountId: string | null;
  accessToken: string | null;
  // Zestwings fields
  accountId: string | null;
  wabaNumber: string | null;
}

/**
 * Get WhatsApp settings from database and decrypt access token (Meta only)
 * Returns null if WhatsApp is not enabled or not configured
 */
export async function getWhatsappSettings(): Promise<WhatsappSettingsResult | null> {
  try {
    const settings = await prisma.whatsappSettings.findUnique({
      where: { id: "single" },
    });

    if (!settings || !settings.enabled) {
      return null;
    }

    // Decrypt Meta access token if present
    let accessToken: string | null = null;
    if (settings.provider === "META" && settings.accessToken) {
      const encryptionKey = process.env.NEXTAUTH_SECRET;
      if (!encryptionKey) {
        console.error("NEXTAUTH_SECRET not configured");
        return null;
      }
      try {
        accessToken = decrypt(settings.accessToken, encryptionKey);
      } catch (error) {
        console.error("Error decrypting WhatsApp access token:", error);
        return null;
      }
    }

    return {
      enabled: settings.enabled,
      provider: settings.provider as WhatsappProvider,
      // Meta fields
      phoneNumberId: settings.phoneNumberId,
      businessAccountId: settings.businessAccountId,
      accessToken: accessToken,
      // Zestwings fields
      accountId: settings.accountId,
      wabaNumber: settings.wabaNumber,
    };
  } catch (error) {
    console.error("Error fetching WhatsApp settings:", error);
    return null;
  }
}
