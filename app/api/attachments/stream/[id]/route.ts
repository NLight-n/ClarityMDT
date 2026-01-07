import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getMinioClient, getDefaultBucket } from "@/lib/minio";
import { convertToPdf } from "@/lib/office/convertToPdf";
import { uploadFile } from "@/lib/minio/upload";

/**
 * Generate storage key for converted PDF
 */
function generatePdfStorageKey(caseId: string, attachmentId: string): string {
  return `cases/${caseId}/attachments-pdf/${attachmentId}.pdf`;
}

/**
 * GET /api/attachments/stream/[id] - Stream a file for viewing in modal
 * This endpoint streams files directly from MinIO (using internal endpoint)
 * so browsers can display them without needing presigned URLs
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

    const client = getMinioClient();
    const bucket = getDefaultBucket();

    // Check if it's an Office file that needs conversion
    const isWord = attachment.fileType === "application/msword" || 
                   attachment.fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isExcel = attachment.fileType === "application/vnd.ms-excel" || 
                    attachment.fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const isPowerPoint = attachment.fileType === "application/vnd.ms-powerpoint" || 
                         attachment.fileType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const isOfficeFile = isWord || isExcel || isPowerPoint;

    let storageKey: string;
    let contentType: string;
    let fileName: string;

    if (isOfficeFile) {
      // For Office files, convert to PDF first
      const pdfStorageKey = generatePdfStorageKey(attachment.caseId, id);
      
      try {
        // Check if PDF already exists in cache
        await client.statObject(bucket, pdfStorageKey);
        // PDF exists, use it
        storageKey = pdfStorageKey;
        contentType = "application/pdf";
        fileName = attachment.fileName.replace(/\.[^/.]+$/, "") + ".pdf";
      } catch (error: any) {
        // PDF doesn't exist, need to convert
        if (error.code === "NoSuchKey" || error.code === "NotFound") {
          // Get the original file from MinIO
          const fileStream = await client.getObject(bucket, attachment.storageKey);
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk);
          }
          const fileBuffer = Buffer.concat(chunks);

          // Convert to PDF
          const pdfBuffer = await convertToPdf(fileBuffer, attachment.fileName);

          // Upload PDF to MinIO cache
          await uploadFile(pdfBuffer, pdfStorageKey, {
            contentType: "application/pdf",
          });

          storageKey = pdfStorageKey;
          contentType = "application/pdf";
          fileName = attachment.fileName.replace(/\.[^/.]+$/, "") + ".pdf";
        } else {
          throw error;
        }
      }
    } else {
      // For images and PDFs, stream directly
      storageKey = attachment.storageKey;
      contentType = attachment.fileType;
      fileName = attachment.fileName;
    }

    // Get the file from MinIO
    try {
      const fileStream = await client.getObject(bucket, storageKey);
      const stat = await client.statObject(bucket, storageKey);

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Return the file with inline disposition (for viewing in modal)
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
          "Content-Length": stat.size.toString(),
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (minioError: any) {
      console.error("Error retrieving file from MinIO:", minioError);
      if (minioError.code === "NoSuchKey" || minioError.code === "NotFound") {
        return NextResponse.json(
          { error: "File not found in storage" },
          { status: 404 }
        );
      }
      throw minioError;
    }
  } catch (error) {
    console.error("Error streaming attachment:", error);
    return NextResponse.json(
      { error: "Failed to stream attachment" },
      { status: 500 }
    );
  }
}

