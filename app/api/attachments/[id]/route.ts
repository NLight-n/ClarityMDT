import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase, canEditCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/minio";

/**
 * DELETE /api/attachments/[id] - Delete an attachment
 */
export async function DELETE(
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

    // Check if user can edit the case (required to delete attachments)
    const canEdit = await canEditCase(currentUser, attachment.caseId);
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete from MinIO
    try {
      await deleteFile(attachment.storageKey);
    } catch (minioError) {
      console.error("Error deleting file from MinIO:", minioError);
      // Continue to delete database record even if MinIO delete fails
    }

    // Delete from database
    await prisma.caseAttachment.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Attachment deleted" }, { status: 200 });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    );
  }
}


