import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/profile/whatsapp/status - Check if WhatsApp notifications are enabled
 * Available to all authenticated users (no admin check).
 * Returns only the enabled flag — no sensitive credentials.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.whatsappSettings.findUnique({
      where: { id: "single" },
      select: { enabled: true },
    });

    return NextResponse.json({
      enabled: settings?.enabled ?? false,
    });
  } catch (error) {
    console.error("Error fetching WhatsApp status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
