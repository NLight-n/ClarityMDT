import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { uploadStream } from "@/lib/minio";
import { Readable } from "stream";

/**
 * PUT /api/dicom/upload-proxy?key=<storageKey>
 *
 * Server-side proxy for uploading individual DICOM files to MinIO.
 * In Docker, browsers cannot reach MinIO directly (the presigned URL
 * points to the internal Docker hostname "minio").  Instead of giving
 * the browser a presigned PUT URL, we proxy the upload through the
 * Next.js server which *can* reach MinIO over the Docker network.
 */
export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storageKey = request.nextUrl.searchParams.get("key");
    if (!storageKey) {
      return NextResponse.json(
        { error: "Missing 'key' query parameter" },
        { status: 400 }
      );
    }

    // Read the raw body as a buffer
    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to a Readable stream for MinIO
    const stream = Readable.from(buffer);

    await uploadStream(stream, storageKey, buffer.length, {
      contentType:
        request.headers.get("content-type") || "application/octet-stream",
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("DICOM upload-proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy upload to storage" },
      { status: 500 }
    );
  }
}
