import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { getMinioClient, getDefaultBucket, ensureBucket } from "@/lib/minio";

/**
 * GET /api/admin/telegram-settings/qr-preview/[...path] - Stream QR code image (Admin only)
 * This endpoint streams the QR code image directly from MinIO (using internal endpoint)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { path } = await params;
    const storageKey = path.join("/");

    if (!storageKey) {
      return NextResponse.json(
        { error: "Storage key is required" },
        { status: 400 }
      );
    }

    const client = getMinioClient();
    const bucket = getDefaultBucket();

    // Ensure bucket exists
    await ensureBucket(bucket);

    try {
      // Get the file from MinIO
      const fileStream = await client.getObject(bucket, storageKey);
      const stat = await client.statObject(bucket, storageKey);

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Determine content type from file extension
      let contentType = "image/png"; // default
      const extension = storageKey.split(".").pop()?.toLowerCase();
      if (extension === "jpg" || extension === "jpeg") {
        contentType = "image/jpeg";
      } else if (extension === "png") {
        contentType = "image/png";
      } else if (extension === "gif") {
        contentType = "image/gif";
      } else if (extension === "webp") {
        contentType = "image/webp";
      }

      // Return the image with inline disposition
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(storageKey.split("/").pop() || "qr-code")}"`,
          "Content-Length": stat.size.toString(),
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (minioError: any) {
      console.error("Error retrieving QR code from MinIO:", minioError);
      if (minioError.code === "NoSuchKey" || minioError.code === "NotFound") {
        return NextResponse.json(
          { error: "QR code image not found in storage" },
          { status: 404 }
        );
      }
      if (minioError.code === "NoSuchBucket") {
        return NextResponse.json(
          { error: "Storage bucket not found. Please check MinIO configuration." },
          { status: 500 }
        );
      }
      throw minioError;
    }
  } catch (error) {
    console.error("Error fetching QR code preview:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

