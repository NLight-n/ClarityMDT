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
 * GET /api/attachments/convert-pdf/[id] - Convert Office file to PDF and return URL
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

    if (!isWord && !isExcel && !isPowerPoint) {
      return NextResponse.json(
        { error: "File type not supported for PDF conversion. Only Office files (Word, Excel, PowerPoint) are supported." },
        { status: 400 }
      );
    }

    // Check if PDF already exists in cache
    const pdfStorageKey = generatePdfStorageKey(attachment.caseId, id);
    const client = getMinioClient();
    const bucket = getDefaultBucket();

    try {
      // Try to stat the file to see if it exists
      await client.statObject(bucket, pdfStorageKey);
      
      // PDF exists in cache, return streaming endpoint URL
      const baseUrl = request.nextUrl.origin;
      const streamUrl = `${baseUrl}/api/attachments/stream/${id}`;
      return NextResponse.json({
        url: streamUrl,
        cached: true,
      });
    } catch (error: any) {
      // File doesn't exist, need to convert
      if (error.code !== "NoSuchKey" && error.code !== "NotFound") {
        throw error;
      }
    }

    // Get the original file from MinIO
    let fileBuffer: Buffer;
    try {
      const fileStream = await client.getObject(bucket, attachment.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(chunk);
      }
      fileBuffer = Buffer.concat(chunks);
    } catch (minioError: any) {
      console.error("Error retrieving file from MinIO:", minioError);
      return NextResponse.json(
        { error: "Failed to retrieve file for conversion" },
        { status: 500 }
      );
    }

    // Convert to PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await convertToPdf(fileBuffer, attachment.fileName);
    } catch (conversionError: any) {
      console.error("Error converting file to PDF:", conversionError);
      return NextResponse.json(
        { 
          error: "Failed to convert file to PDF",
          details: conversionError.message,
        },
        { status: 500 }
      );
    }

    // Upload PDF to MinIO cache
    try {
      await uploadFile(pdfBuffer, pdfStorageKey, {
        contentType: "application/pdf",
        metadata: {
          originalAttachmentId: id,
          originalFileName: attachment.fileName,
          convertedAt: new Date().toISOString(),
        },
      });
    } catch (uploadError) {
      console.error("Error uploading converted PDF to MinIO:", uploadError);
      return NextResponse.json(
        { error: "Failed to cache converted PDF" },
        { status: 500 }
      );
    }

    // Return streaming endpoint URL for the PDF
    const baseUrl = request.nextUrl.origin;
    const streamUrl = `${baseUrl}/api/attachments/stream/${id}`;

    return NextResponse.json({
      url: streamUrl,
      cached: false,
    });
  } catch (error) {
    console.error("Error in PDF conversion endpoint:", error);
    return NextResponse.json(
      { error: "Failed to convert file to PDF" },
      { status: 500 }
    );
  }
}

