import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { getTelegramSettings } from "@/lib/telegram/getSettings";

/**
 * GET /api/profile/telegram/bot-username - Get Telegram bot username
 * @deprecated Use /api/profile/telegram/bot-info instead
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get bot username from database
    const settings = await getTelegramSettings();
    const botUsername = settings?.botName || "";

    return NextResponse.json({ botUsername });
  } catch (error) {
    console.error("Error fetching bot username:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

