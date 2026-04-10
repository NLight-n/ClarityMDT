import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // SSRF Protection: Ensure targetUrl strictly points to our designated MinIO/S3 instance.
    // The presigned URLs use the internal MinIO endpoint (Docker service name or localhost).
    const minioEndpoint = process.env.MINIO_ENDPOINT || "localhost";
    
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      return NextResponse.json({ error: "Invalid URL parameter" }, { status: 400 });
    }

    // Allow the configured MinIO endpoint (e.g., "minio" in Docker), and common local aliases
    const allowedHosts = new Set([
      minioEndpoint,
      "localhost",
      "127.0.0.1",
    ]);

    if (!allowedHosts.has(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "Forbidden: URL proxying is restricted to internal buckets." },
        { status: 403 }
      );
    }

    // Proxy the request to MinIO using the internal URL.
    // In Docker, this resolves via the Docker network (e.g., http://minio:9000/...)
    const response = await fetch(targetUrl, {
      method: "GET",
    });

    if (!response.ok) {
      console.error(`DICOM proxy: MinIO returned ${response.status} for ${parsedUrl.pathname}`);
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
