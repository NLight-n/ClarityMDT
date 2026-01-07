import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/images/[...path] - Redirect to streaming endpoint for images
 * This is used to display images in the rich text editor
 * Redirects to the streaming endpoint for consistent image serving
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

    // Redirect to streaming endpoint
    const baseUrl = request.nextUrl.origin;
    const streamUrl = `${baseUrl}/api/images/stream/${encodeURIComponent(storageKey)}`;

    // Check if client wants JSON response (for programmatic access)
    const acceptHeader = request.headers.get("accept");
    if (acceptHeader?.includes("application/json")) {
      return NextResponse.json({ url: streamUrl });
    }

    // Redirect to the streaming endpoint
    // This works for <img src="/api/images/..."> tags
    return NextResponse.redirect(streamUrl);
  } catch (error) {
    console.error("Error generating image URL:", error);
    return NextResponse.json(
      { error: "Failed to load image" },
      { status: 500 }
    );
  }
}

