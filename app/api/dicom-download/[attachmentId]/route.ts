import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getFileStream } from "@/lib/minio";
import archiver from "archiver";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { attachmentId } = await params;

    const attachment = await prisma.caseAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        case: {
          select: { id: true, patientName: true },
        },
      },
    });

    // @ts-ignore
    if (!attachment || !attachment.isDicomBundle) {
      return NextResponse.json({ error: "Invalid DICOM bundle" }, { status: 400 });
    }

    const canView = await canViewCase(currentUser, attachment.case.id);
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Fetch manifest JSON
    const manifestStream = await getFileStream(attachment.storageKey);
    const chunks = [];
    for await (const chunk of manifestStream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const manifestBuffer = Buffer.concat(chunks);
    const manifest = JSON.parse(manifestBuffer.toString("utf8"));

    // 2. Extract DICOM storage keys
    const storageKeys = new Set<string>();
    if (manifest.studies && Array.isArray(manifest.studies)) {
      for (const study of manifest.studies) {
        if (study.series && Array.isArray(study.series)) {
          for (const series of study.series) {
            if (series.instances && Array.isArray(series.instances)) {
              for (const instance of series.instances) {
                if (instance.url) {
                  storageKeys.add(instance.url);
                }
              }
            }
          }
        }
      }
    }

    if (storageKeys.size === 0) {
      return NextResponse.json({ error: "No files found in DICOM bundle" }, { status: 404 });
    }

    // 3. Create a TransformStream to pipe archiver straight to Response
    const { readable, writable } = new TransformStream();
    
    // Convert Web WritableStream to Node stream so archiver can use it
    // Use an async function to run the archiver independently without blocking Response
    const zipArchive = archiver('zip', { zlib: { level: 0 } }); // level 0 for speed, DICOMs are usually compressed
    
    // Create a wrapper around the TransformStream's writer
    const writer = writable.getWriter();
    
    zipArchive.on('data', (data) => {
      writer.write(data);
    });
    
    zipArchive.on('end', () => {
      writer.close();
    });
    
    zipArchive.on('error', (err) => {
      console.error('Archiver error:', err);
      writer.abort(err);
    });

    // We process the piping asynchronously
    (async () => {
      for (const storageKey of storageKeys) {
        try {
          const fileStream = await getFileStream(storageKey);
          
          // Calculate a realistic filename, typically using the folder name + storage key last segment
          const fileName = storageKey.split('/').pop() || 'file.dcm';
          
          zipArchive.append(fileStream as any, { name: fileName });
        } catch (err) {
          console.warn(`Could not stream file ${storageKey} to zip`, err);
        }
      }
      zipArchive.finalize();
    })();

    // 4. Return the readable half of the stream immediately
    const sanitizedPatientName = attachment.case.patientName.replace(/[^a-zA-Z0-9]/g, "_");
    
    return new NextResponse(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="DICOM_${sanitizedPatientName}.zip"`,
        "Transfer-Encoding": "chunked",
      },
      status: 200,
    });
    
  } catch (error) {
    console.error("Error creating DICOM zip:", error);
    return NextResponse.json({ error: "Failed to download DICOM bundle" }, { status: 500 });
  }
}
