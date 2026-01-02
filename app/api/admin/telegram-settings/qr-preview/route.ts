import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { generatePresignedUrl } from "@/lib/minio/generatePresignedUrl";

/**
 * GET /api/admin/telegram-settings/qr-preview - Get presigned URL for QR code image (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storageKey = searchParams.get("key");

    if (!storageKey) {
      return NextResponse.json(
        { error: "Storage key is required" },
        { status: 400 }
      );
    }

    try {
      const url = await generatePresignedUrl(storageKey, 3600);
      return NextResponse.json({ url });
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      return NextResponse.json(
        { error: "Failed to generate preview URL" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error fetching QR code preview:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

