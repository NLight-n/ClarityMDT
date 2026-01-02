import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { generatePresignedUrl } from "@/lib/minio/generatePresignedUrl";

/**
 * GET /api/attachments/view/[id] - Get a presigned URL for viewing an attachment
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

    // Check if it's an Office file
    const isWord = attachment.fileType === "application/msword" || 
                   attachment.fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isExcel = attachment.fileType === "application/vnd.ms-excel" || 
                    attachment.fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const isPowerPoint = attachment.fileType === "application/vnd.ms-powerpoint" || 
                         attachment.fileType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const isOfficeFile = isWord || isExcel || isPowerPoint;

    if (isOfficeFile) {
      // For Office files, return the PDF conversion endpoint URL
      const baseUrl = request.nextUrl.origin;
      const conversionUrl = `${baseUrl}/api/attachments/convert-pdf/${id}`;
      
      return NextResponse.json({
        url: conversionUrl,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        needsConversion: true,
      });
    } else {
      // For images and PDFs, use presigned URL
      const presignedUrl = await generatePresignedUrl(attachment.storageKey, 3600);
      return NextResponse.json({
        url: presignedUrl,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
      });
    }
  } catch (error) {
    console.error("Error generating view URL:", error);
    return NextResponse.json(
      { error: "Failed to generate view URL" },
      { status: 500 }
    );
  }
}

