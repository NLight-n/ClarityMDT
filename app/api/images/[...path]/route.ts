import { NextRequest, NextResponse } from "next/server";
import { generatePresignedUrl } from "@/lib/minio/generatePresignedUrl";

/**
 * GET /api/images/[...path] - Get presigned URL for an image stored in MinIO
 * This is used to display images in the rich text editor
 * Returns a redirect to the presigned URL
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

    // Generate presigned URL (valid for 7 days)
    const imageUrl = await generatePresignedUrl(storageKey, 7 * 24 * 60 * 60);

    // Check if client wants JSON response (for programmatic access)
    const acceptHeader = request.headers.get("accept");
    if (acceptHeader?.includes("application/json")) {
      return NextResponse.json({ url: imageUrl });
    }

    // Redirect to the presigned URL
    // This works for <img src="/api/images/..."> tags
    return NextResponse.redirect(imageUrl);
  } catch (error) {
    console.error("Error generating image URL:", error);
    return NextResponse.json(
      { error: "Failed to load image" },
      { status: 500 }
    );
  }
}

