import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/profile/telegram/bot-info - Get Telegram bot info (bot username and QR code) for linking
 * Available to all authenticated users
 * Returns the QR code URL as a streaming endpoint path instead of presigned URL
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.telegramSettings.findUnique({
      where: { id: "single" },
    });

    if (!settings || !settings.enabled) {
      return NextResponse.json({
        botUsername: null,
        qrCodeUrl: null,
      });
    }

    let qrCodePreviewUrl: string | null = null;
    if (settings.qrCodeUrl) {
      // Use streaming endpoint - check if it's already a full URL or a storage key
      if (settings.qrCodeUrl.startsWith("http://") || settings.qrCodeUrl.startsWith("https://")) {
        // It's a presigned URL (old data) - we can't use it, return null
        // User will need to re-upload the QR code
        qrCodePreviewUrl = null;
      } else {
        // It's a storage key - use streaming endpoint
        const baseUrl = request.nextUrl.origin;
        qrCodePreviewUrl = `${baseUrl}/api/images/stream/${settings.qrCodeUrl}`;
      }
    }

    return NextResponse.json({
      botUsername: settings.botName,
      qrCodeUrl: qrCodePreviewUrl,
    });
  } catch (error) {
    console.error("Error fetching Telegram bot info:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

