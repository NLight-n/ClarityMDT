import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import {
  canEditRadiologyFindings,
  canEditPathologyFindings,
} from "@/lib/permissions/accessControl";

/**
 * GET /api/cases/[id]/permissions - Check if user can edit radiology/pathology findings
 * Query params:
 *   - type: "radiology" | "pathology"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type || (type !== "radiology" && type !== "pathology")) {
      return NextResponse.json(
        { error: "Invalid type parameter. Must be 'radiology' or 'pathology'" },
        { status: 400 }
      );
    }

    let canEdit = false;

    if (type === "radiology") {
      canEdit = await canEditRadiologyFindings(user, id);
    } else if (type === "pathology") {
      canEdit = await canEditPathologyFindings(user, id);
    }

    return NextResponse.json({ canEdit });
  } catch (error) {
    console.error("Error checking permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


