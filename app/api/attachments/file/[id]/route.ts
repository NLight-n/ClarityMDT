import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getMinioClient, getDefaultBucket } from "@/lib/minio";

/**
 * GET /api/attachments/file/[id] - Download a file attachment
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

    // Get MinIO client
    const client = getMinioClient();
    const bucket = getDefaultBucket();

    // Get the file from MinIO
    try {
      const fileStream = await client.getObject(bucket, attachment.storageKey);
      const stat = await client.statObject(bucket, attachment.storageKey);

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Return the file with appropriate headers
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": attachment.fileType,
          "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
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
    console.error("Error downloading attachment:", error);
    return NextResponse.json(
      { error: "Failed to download attachment" },
      { status: 500 }
    );
  }
}

