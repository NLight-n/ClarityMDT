import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // SSRF Protection: Ensure targetUrl strictly points to our designated MinIO/S3 instance
    // We expect the URL to be a valid MinIO presigned URL containing our storage origin.
    const minioEndpoint = process.env.MINIO_ENDPOINT || "localhost";
    const minioPort = process.env.MINIO_PORT || "9000";
    
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      return NextResponse.json({ error: "Invalid URL parameter" }, { status: 400 });
    }

    if (parsedUrl.hostname !== minioEndpoint && parsedUrl.hostname !== "127.0.0.1" && parsedUrl.hostname !== "localhost") {
      return NextResponse.json(
        { error: "Forbidden: URL proxying is restricted to internal buckets." },
        { status: 403 }
      );
    }

    // Proxy the request to MinIO
    const response = await fetch(targetUrl, {
      method: "GET",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch from storage: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const fileBuffer = await response.arrayBuffer();

    // Send the raw data back to the browser with basic CORS headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Content-Length": fileBuffer.byteLength.toString(),
        "Cache-Control": "private, max-age=86400",
        // Expose headers for cornerstone
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Length, Content-Type",
      },
    });
  } catch (error) {
    console.error("DICOM proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error during proxying" },
      { status: 500 }
    );
  }
}
