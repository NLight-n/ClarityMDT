import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { stopUserTelegramPolling } from "@/lib/telegram/polling";

/**
 * PATCH /api/profile/telegram - Link or unlink Telegram ID
 * Users can link their Telegram account by providing a verification code
 * or unlink by setting telegramId to null
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { telegramId } = body;

    // If telegramId is null or empty string, unlink Telegram
    if (telegramId === null || telegramId === "") {
      await prisma.user.update({
        where: { id: user.id },
        data: { telegramId: null },
      });

      // Stop any active polling for this user
      stopUserTelegramPolling(user.id);

      return NextResponse.json({
        message: "Telegram account unlinked successfully",
        telegramId: null,
      });
    }

    // Validate telegramId format (should be a numeric string)
    if (typeof telegramId !== "string" || !/^\d+$/.test(telegramId)) {
      return NextResponse.json(
        { error: "Invalid Telegram ID format" },
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

    // Update user's Telegram ID
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { telegramId: telegramId },
      select: {
        id: true,
        name: true,
        telegramId: true,
      },
    });

    return NextResponse.json({
      message: "Telegram account linked successfully",
      telegramId: updatedUser.telegramId,
    });
  } catch (error) {
    console.error("Error updating Telegram ID:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

