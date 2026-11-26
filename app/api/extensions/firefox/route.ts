import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "downloads",
      "clarity-hms-bridge.xpi"
    );
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/x-xpinstall",
        "Content-Disposition": 'inline; filename="clarity-hms-bridge-0.1.0.xpi"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Firefox extension package not found" },
      { status: 404 }
    );
  }
}
