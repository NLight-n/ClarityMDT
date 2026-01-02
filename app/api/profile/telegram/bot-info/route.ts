import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { generatePresignedUrl } from "@/lib/minio/generatePresignedUrl";

/**
 * GET /api/profile/telegram/bot-info - Get Telegram bot info (bot username and QR code) for linking
 * Available to all authenticated users
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
      try {
        qrCodePreviewUrl = await generatePresignedUrl(settings.qrCodeUrl, 3600);
      } catch (error) {
        console.error("Error generating QR code preview URL:", error);
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

