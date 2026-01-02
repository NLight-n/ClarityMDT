import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { randomBytes } from "crypto";
import { startUserTelegramPolling } from "@/lib/telegram/polling";

/**
 * POST /api/profile/telegram/generate-code - Generate a verification code for Telegram linking
 * Returns a verification code that expires in 10 minutes
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user already has Telegram linked
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { telegramId: true },
    });

    if (userData?.telegramId) {
      return NextResponse.json(
        { error: "Telegram account is already linked" },
        { status: 400 }
      );
    }

    // Generate a random 8-character code
    const code = randomBytes(4).toString("hex").toUpperCase();

    // Delete any existing verification code for this user
    await prisma.telegramVerification.deleteMany({
      where: { userId: user.id },
    });

    // Create new verification code (expires in 10 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await prisma.telegramVerification.create({
      data: {
        userId: user.id,
        code: code,
        expiresAt: expiresAt,
      },
    });

    // Get bot username from database
    const { getTelegramSettings } = await import("@/lib/telegram/getSettings");
    const telegramSettings = await getTelegramSettings();
    
    if (!telegramSettings || !telegramSettings.botName) {
      return NextResponse.json(
        { error: "Telegram is not configured or disabled. Please contact an administrator." },
        { status: 400 }
      );
    }
    
    const botUsername = telegramSettings.botName;

    // Start polling for this user's verification (will stop automatically after 10 minutes or when linked)
    await startUserTelegramPolling(user.id, code);

    return NextResponse.json({
      code: code,
      botUsername: botUsername,
      expiresIn: 10, // minutes
      instructions: `Send this code "${code}" to @${botUsername} on Telegram to link your account.`,
    });
  } catch (error) {
    console.error("Error generating verification code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

