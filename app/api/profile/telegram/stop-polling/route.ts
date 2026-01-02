import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { stopUserTelegramPolling } from "@/lib/telegram/polling";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/profile/telegram/stop-polling - Stop polling for current user's verification
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`[Stop Polling API] Stopping polling for user ${user.id}`);
    
    // Stop polling for this user
    stopUserTelegramPolling(user.id);

    // Delete any pending verification code for this user
    const deleted = await prisma.telegramVerification.deleteMany({
      where: { userId: user.id },
    });
    
    console.log(`[Stop Polling API] Deleted ${deleted.count} verification code(s) for user ${user.id}`);

    return NextResponse.json({
      message: "Polling stopped successfully",
    });
  } catch (error) {
    console.error("Error stopping polling:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

