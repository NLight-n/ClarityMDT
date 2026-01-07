import { NextRequest, NextResponse } from "next/server";
import { getMinioClient, getDefaultBucket } from "@/lib/minio";

/**
 * GET /api/images/stream/[...path] - Stream an image from MinIO for display
 * This endpoint streams images directly from MinIO (using internal endpoint)
 * so browsers can display them without needing presigned URLs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const storageKey = path.join("/");

    if (!storageKey) {
      return NextResponse.json(
        { error: "Invalid image path" },
        { status: 400 }
      );
    }

    const client = getMinioClient();
    const bucket = getDefaultBucket();

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

      // Determine content type from file extension or default to image
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

      // Return the image with inline disposition (for viewing)
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(storageKey.split("/").pop() || "image")}"`,
          "Content-Length": stat.size.toString(),
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (minioError: any) {
      console.error("Error retrieving image from MinIO:", minioError);
      if (minioError.code === "NoSuchKey" || minioError.code === "NotFound") {
        return NextResponse.json(
          { error: "Image not found in storage" },
          { status: 404 }
        );
      }
      throw minioError;
    }
  } catch (error) {
    console.error("Error streaming image:", error);
    return NextResponse.json(
      { error: "Failed to stream image" },
      { status: 500 }
    );
  }
}

