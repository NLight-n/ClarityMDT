import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditConsensusReport, canViewCase } from "@/lib/permissions/accessControl";
import { CaseStatus } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";
import { NotificationType } from "@prisma/client";

const createConsensusSchema = z.object({
  finalDiagnosis: z.string().min(1, "Final diagnosis is required"),
  mdtConsensus: z.string().min(1, "MDT consensus is required"),
  meetingDate: z.string().min(1, "Meeting date is required"),
  remarks: z.string().optional().nullable(),
});

const updateConsensusSchema = z.object({
  finalDiagnosis: z.string().min(1).optional(),
  mdtConsensus: z.string().min(1).optional(),
  meetingDate: z.string().min(1).optional(),
  remarks: z.string().optional().nullable(),
});

/**
 * POST /api/consensus/[caseId] - Create a consensus report
 * Rules:
 * - Only coordinators or admins can create consensus reports
 * - One report per case (enforced by unique constraint)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { caseId } = await params;

    // Check if user can edit consensus reports (only coordinators/admins)
    if (!canEditConsensusReport(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can create consensus reports" },
        { status: 403 }
      );
    }

    // Verify that the case exists and user can view it
    const canView = await canViewCase(user, caseId);
    if (!canView) {
      return NextResponse.json(
        { error: "Case not found or access denied" },
        { status: 404 }
      );
    }

    // Verify case exists
    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Check if consensus report already exists for this case
    const existingReport = await prisma.consensusReport.findUnique({
      where: { caseId },
      select: { id: true },
    });

    if (existingReport) {
      return NextResponse.json(
        { error: "A consensus report already exists for this case. Use PATCH to update it." },
        { status: 409 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = createConsensusSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { finalDiagnosis, mdtConsensus, meetingDate, remarks } = validationResult.data;

    // Parse the meeting date
    const parsedMeetingDate = new Date(meetingDate);
    if (isNaN(parsedMeetingDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid meeting date format" },
        { status: 400 }
      );
    }

    // Create the consensus report and update case status to REVIEWED
    const consensusReport = await prisma.consensusReport.create({
      data: {
        caseId,
        finalDiagnosis,
        mdtConsensus,
        meetingDate: parsedMeetingDate,
        remarks: remarks || null,
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            loginId: true,
          },
        },
        case: {
          select: {
            id: true,
            patientName: true,
          },
        },
      },
    });

    // Update case status to REVIEWED and set reviewedAt timestamp
    await prisma.case.update({
      where: { id: caseId },
      data: {
        status: CaseStatus.REVIEWED,
        reviewedAt: new Date(),
      },
    });

    // Create audit log for consensus creation
    await createAuditLog({
      action: AuditAction.CONSENSUS_CREATE,
      userId: user.id,
      caseId: caseId,
      details: {
        finalDiagnosis: finalDiagnosis.substring(0, 100), // Truncate for storage
      },
      ipAddress: getIpAddress(request.headers),
    });

    // Create notification for creator and department consultants about MDT review completion
    if (consensusReport.case) {
      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
          createdById: true,
          patientName: true,
          presentingDepartment: {
            select: { id: true, name: true },
          },
        },
      });

      if (caseRecord) {
        const recipients = new Set<string>();
        if (caseRecord.createdById) {
          recipients.add(caseRecord.createdById);
        }

        if (caseRecord.presentingDepartment) {
          const deptConsultants = await prisma.user.findMany({
            where: {
              departmentId: caseRecord.presentingDepartment.id,
              role: "Consultant",
            },
            select: { id: true },
          });
          deptConsultants.forEach((u) => recipients.add(u.id));
        }

        if (recipients.size > 0) {
          await createNotificationsForUsers(Array.from(recipients), {
          type: NotificationType.MDT_REVIEW_COMPLETED,
          title: "MDT Review Completed",
            message: `MDT review completed for ${caseRecord.patientName}. Consensus report generated.`,
          caseId: caseId,
        });
        }
      }
    }

    return NextResponse.json(consensusReport, { status: 201 });
  } catch (error) {
    console.error("Error creating consensus report:", error);
    
    // Handle unique constraint violation (caseId already exists)
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "A consensus report already exists for this case. Use PATCH to update it." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create consensus report" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/consensus/[caseId] - Update a consensus report
 * Rules:
 * - Only coordinators or admins can update consensus reports
 * - One report per case (will update existing or return error)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { caseId } = await params;

    // Check if user can edit consensus reports (only coordinators/admins)
    if (!canEditConsensusReport(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can update consensus reports" },
        { status: 403 }
      );
    }

    // Verify that the case exists and user can view it
    const canView = await canViewCase(user, caseId);
    if (!canView) {
      return NextResponse.json(
        { error: "Case not found or access denied" },
        { status: 404 }
      );
    }

    // Verify case exists
    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Check if consensus report exists
    const existingReport = await prisma.consensusReport.findUnique({
      where: { caseId },
      select: { id: true },
    });

    if (!existingReport) {
      return NextResponse.json(
        { error: "Consensus report not found. Use POST to create one." },
        { status: 404 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateConsensusSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const updateData: {
      finalDiagnosis?: string;
      mdtConsensus?: string;
      meetingDate?: Date;
      remarks?: string | null;
    } = {};

    if (validationResult.data.finalDiagnosis !== undefined) {
      updateData.finalDiagnosis = validationResult.data.finalDiagnosis;
    }

    if (validationResult.data.mdtConsensus !== undefined) {
      updateData.mdtConsensus = validationResult.data.mdtConsensus;
    }

    if (validationResult.data.meetingDate !== undefined) {
      const parsedMeetingDate = new Date(validationResult.data.meetingDate);
      if (isNaN(parsedMeetingDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid meeting date format" },
          { status: 400 }
        );
      }
      updateData.meetingDate = parsedMeetingDate;
    }

    if (validationResult.data.remarks !== undefined) {
      updateData.remarks = validationResult.data.remarks;
    }

    // If no fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Update the consensus report
    const updatedReport = await prisma.consensusReport.update({
      where: { caseId },
      data: updateData,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            loginId: true,
          },
        },
        case: {
          select: {
            id: true,
            patientName: true,
          },
        },
      },
    });

    // Ensure case status is REVIEWED (if it's not already) and set reviewedAt if not set
    await prisma.case.update({
      where: { id: caseId },
      data: {
        status: CaseStatus.REVIEWED,
        reviewedAt: new Date(), // Update timestamp on each consensus update
      },
    });

    // Create audit log for consensus edit
    await createAuditLog({
      action: AuditAction.CONSENSUS_EDIT,
      userId: user.id,
      caseId: caseId,
      details: {
        fieldsUpdated: Object.keys(updateData),
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json(updatedReport);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating consensus report:", error);
    return NextResponse.json(
      { error: "Failed to update consensus report" },
      { status: 500 }
    );
  }
}

