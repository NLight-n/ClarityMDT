import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { getFileStream } from "@/lib/minio";
import { verifyWeasisToken } from "@/lib/weasis/tokens";
import { decodeFileId, extractManifestStorageKeys } from "@/lib/weasis/manifestConverter";
import { createAuditLog, AuditAction } from "@/lib/audit/logger";

function nodeStreamToWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer | string) => {
        controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        controller.close();
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      if ("destroy" in nodeStream && typeof nodeStream.destroy === "function") {
        nodeStream.destroy();
      }
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; fileId: string }> }
) {
  try {
    const { token, fileId } = await params;

    const payload = verifyWeasisToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    if (!fileId) {
      return NextResponse.json({ error: "File ID is required" }, { status: 400 });
    }

    const requestedStorageKey = decodeFileId(fileId);
    if (!requestedStorageKey) {
      return NextResponse.json({ error: "Invalid file identifier" }, { status: 400 });
    }

    // Load attachment from database
    const attachment = await prisma.caseAttachment.findUnique({
      where: { id: payload.attachmentId },
      select: {
        id: true,
        storageKey: true,
        isDicomBundle: true,
        caseId: true,
      },
    });

    if (!attachment || !attachment.isDicomBundle) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Fetch manifest JSON to validate that requested object belongs to this attachment
    const manifestStream = await getFileStream(attachment.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of manifestStream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const manifestBuffer = Buffer.concat(chunks);
    const manifest = JSON.parse(manifestBuffer.toString("utf8"));

    const allowedStorageKeys = extractManifestStorageKeys(manifest);

    // Also include MPR derived series keys if any
    const completedMprJobs = await prisma.mprJob.findMany({
      where: { attachmentId: attachment.id, status: "COMPLETED" },
      select: { derivedSeriesKeys: true },
    });

    for (const job of completedMprJobs) {
      const derivedKeys = job.derivedSeriesKeys as Record<string, any> | null;
      if (!derivedKeys) continue;

      for (const info of Object.values(derivedKeys)) {
        if (!info || !info.storagePrefix || !info.sliceCount) continue;
        for (let i = 0; i < info.sliceCount; i++) {
          allowedStorageKeys.add(`${info.storagePrefix}/${String(i).padStart(6, "0")}.dcm`);
        }
      }
    }

    // Security enforcement: verify requested storage key belongs to this attachment
    if (!allowedStorageKeys.has(requestedStorageKey)) {
      return NextResponse.json(
        { error: "Forbidden: File does not belong to authorized attachment" },
        { status: 403 }
      );
    }

    // Stream file from MinIO
    const fileStream = await getFileStream(requestedStorageKey);
    const webStream = nodeStreamToWebStream(fileStream);

    // Audit log file access (fire and forget)
    createAuditLog({
      action: AuditAction.WEASIS_FILE_ACCESS,
      userId: payload.userId,
      caseId: payload.caseId,
      details: {
        attachmentId: payload.attachmentId,
        storageKey: requestedStorageKey,
      },
    }).catch(() => {});

    const filename = requestedStorageKey.split("/").pop() || "instance.dcm";

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/dicom",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "Content-Length, Content-Type",
      },
    });
  } catch (error) {
    console.error("Error streaming DICOM file to Weasis:", error);
    return NextResponse.json(
      { error: "Failed to stream DICOM file" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
