import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { encrypt, decrypt } from "@/lib/encryption/crypto";
import { uploadFile } from "@/lib/minio/upload";

/**
 * GET /api/admin/telegram-settings - Get Telegram settings (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.telegramSettings.findUnique({
      where: { id: "single" },
    });

    if (!settings) {
      // Return default settings if none exist
      return NextResponse.json({
        enabled: false,
        botName: null,
        botToken: null,
        qrCodeUrl: null,
      });
    }

    // Return settings with masked token
    return NextResponse.json({
      enabled: settings.enabled,
      botName: settings.botName,
      botToken: settings.botToken ? "***masked***" : null,
      qrCodeUrl: settings.qrCodeUrl,
    });
  } catch (error) {
    console.error("Error fetching Telegram settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/telegram-settings - Update Telegram settings (Admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, botName, botToken, qrCodeImage } = body;

    // Get encryption key from env
    const encryptionKey = process.env.NEXTAUTH_SECRET;
    if (!encryptionKey) {
      return NextResponse.json(
        { error: "NEXTAUTH_SECRET not configured" },
        { status: 500 }
      );
    }

    // Get existing settings
    const existingSettings = await prisma.telegramSettings.findUnique({
      where: { id: "single" },
    });

    // Prepare update data
    const updateData: any = {};

    if (enabled !== undefined) {
      updateData.enabled = enabled;
    }

    if (botName !== undefined) {
      updateData.botName = botName?.trim() || null;
    }

    if (botToken !== undefined) {
      if (botToken && botToken !== "***masked***") {
        // Encrypt the token
        updateData.botToken = encrypt(botToken, encryptionKey);
      } else if (botToken === null || botToken === "") {
        updateData.botToken = null;
      }
      // If botToken is "***masked***", don't update it
    }

    // Handle QR code image upload
    if (qrCodeImage !== undefined) {
      if (qrCodeImage && qrCodeImage.startsWith("data:image/")) {
        // Upload base64 image to MinIO
        try {
          const base64Data = qrCodeImage.split(",")[1];
          const buffer = Buffer.from(base64Data, "base64");
          
          // Determine file extension from data URL
          const mimeMatch = qrCodeImage.match(/data:image\/(\w+);base64/);
          const extension = mimeMatch ? mimeMatch[1] : "png";
          
          const storageKey = `telegram/qr-${Date.now()}.${extension}`;
          await uploadFile(buffer, storageKey, {
            contentType: `image/${extension}`,
          });
          
          updateData.qrCodeUrl = storageKey;
        } catch (uploadError) {
          console.error("Error uploading QR code:", uploadError);
          return NextResponse.json(
            { error: "Failed to upload QR code image" },
            { status: 500 }
          );
        }
      } else if (qrCodeImage === null || qrCodeImage === "") {
        updateData.qrCodeUrl = null;
      }
    }

    // Update or create settings
    const updatedSettings = await prisma.telegramSettings.upsert({
      where: { id: "single" },
      update: updateData,
      create: {
        id: "single",
        enabled: enabled ?? false,
        botName: botName?.trim() || null,
        botToken: updateData.botToken || null,
        qrCodeUrl: updateData.qrCodeUrl || null,
      },
    });

    // Return updated settings with masked token
    return NextResponse.json({
      enabled: updatedSettings.enabled,
      botName: updatedSettings.botName,
      botToken: updatedSettings.botToken ? "***masked***" : null,
      qrCodeUrl: updatedSettings.qrCodeUrl,
    });
  } catch (error) {
    console.error("Error updating Telegram settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

