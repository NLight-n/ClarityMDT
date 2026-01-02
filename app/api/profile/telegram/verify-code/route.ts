import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";

/**
 * POST /api/profile/telegram/verify-code - Verify code and link Telegram account
 * User provides the verification code they received, and we link their Telegram account
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

    const body = await request.json();
    const { code } = body;

    // Validate inputs
    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Verification code is required" },
        { status: 400 }
      );
    }

    // Find the verification record
    const verification = await prisma.telegramVerification.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!verification) {
      return NextResponse.json(
        { error: "No verification code found. Please request a new code." },
        { status: 400 }
      );
    }

    // Check if code matches
    if (verification.code.toUpperCase() !== code.toUpperCase().trim()) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Check if code has expired
    if (new Date() > verification.expiresAt) {
      await prisma.telegramVerification.delete({
        where: { id: verification.id },
      });
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new code." },
        { status: 400 }
      );
    }

    // Get the Telegram ID from the verification record (stored when code was sent)
    const telegramId = verification.telegramId;

    if (!telegramId) {
      return NextResponse.json(
        { error: "Telegram ID not found in verification record. Please request a new code." },
        { status: 400 }
      );
    }

    // Check if this Telegram ID is already linked to another user
    const existingUser = await prisma.user.findFirst({
      where: {
        telegramId: telegramId,
        id: { not: user.id },
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "This Telegram account is already linked to another user" },
        { status: 400 }
      );
    }

    // Link Telegram ID to user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { telegramId: telegramId },
      select: {
        id: true,
        name: true,
        telegramId: true,
      },
    });

    // Delete the verification record
    await prisma.telegramVerification.delete({
      where: { id: verification.id },
    });

    // Send confirmation message to Telegram
    try {
      await sendTelegramMessage({
        chatId: telegramId,
        text: `✅ Successfully linked! Your Telegram account is now connected to ${verification.user.name}.\n\nYou will now receive notifications from the MDT App.`,
      });
    } catch (error) {
      // Log but don't fail - account is already linked
      console.error("Error sending confirmation message:", error);
    }

    return NextResponse.json({
      message: "Telegram account linked successfully",
      telegramId: updatedUser.telegramId,
    });
  } catch (error) {
    console.error("Error verifying code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

