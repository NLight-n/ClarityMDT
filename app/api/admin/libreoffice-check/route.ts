import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { getLibreOfficeInfo } from "@/lib/office/convertToPdf";

/**
 * GET /api/admin/libreoffice-check - Check LibreOffice installation (Admin only)
 * Useful for debugging Office file conversion issues
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const info = await getLibreOfficeInfo();
    
    return NextResponse.json(info, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error checking LibreOffice:", error);
    return NextResponse.json(
      { 
        error: "Failed to check LibreOffice",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

