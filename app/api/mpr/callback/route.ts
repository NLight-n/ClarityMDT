import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/mpr/callback
 * 
 * Called by the Python MPR worker to report job progress, completion, or failure.
 * This endpoint is NOT authenticated via user session — it is secured by
 * Docker network isolation (only reachable from within clarityapp_network).
 * 
 * Body: { jobId, status, progress?, derivedSeriesKeys?, errorMessage?, processingTime?, instanceCount? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, status, progress, derivedSeriesKeys, errorMessage, processingTime, instanceCount } = body;

    if (!jobId || !status) {
      return NextResponse.json(
        { error: "Missing required fields: jobId, status" },
        { status: 400 }
      );
    }

    // Verify job exists
    const existingJob = await prisma.mprJob.findUnique({
      where: { id: jobId },
    });

    if (!existingJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Build update data
    const updateData: any = {};

    if (status === "PROCESSING") {
      updateData.status = "PROCESSING";
      if (typeof progress === "number") {
        updateData.progress = Math.min(progress, 99);
      }
    } else if (status === "COMPLETED") {
      updateData.status = "COMPLETED";
      updateData.progress = 100;
      updateData.completedAt = new Date();
      if (derivedSeriesKeys) {
        updateData.derivedSeriesKeys = derivedSeriesKeys;
      }
      if (typeof processingTime === "number") {
        updateData.processingTime = processingTime;
      }
      if (typeof instanceCount === "number") {
        updateData.instanceCount = instanceCount;
      }
    } else if (status === "FAILED") {
      updateData.status = "FAILED";
      updateData.errorMessage = errorMessage || "Unknown error";
      if (typeof processingTime === "number") {
        updateData.processingTime = processingTime;
      }
    }

    await prisma.mprJob.update({
      where: { id: jobId },
      data: updateData,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error processing MPR callback:", error);
    return NextResponse.json(
      { error: "Failed to process callback" },
      { status: 500 }
    );
  }
}
