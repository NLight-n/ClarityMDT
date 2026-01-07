import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/attachments/view/[id] - Get streaming URL for viewing an attachment
 * Legacy endpoint - redirects to streaming endpoint
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get the attachment record
    const attachment = await prisma.caseAttachment.findUnique({
      where: { id },
      include: {
        case: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Check if user can view the case
    const canView = await canViewCase(currentUser, attachment.caseId);
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Return streaming endpoint URL
    const baseUrl = request.nextUrl.origin;
    const streamUrl = `${baseUrl}/api/attachments/stream/${id}`;
    
    return NextResponse.json({
      url: streamUrl,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
    });
  } catch (error) {
    console.error("Error generating view URL:", error);
    return NextResponse.json(
      { error: "Failed to generate view URL" },
      { status: 500 }
    );
  }
}

