import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase, canViewCase, isCoordinator } from "@/lib/permissions/accessControl";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import { CaseStatus, Gender, NotificationType } from "@prisma/client";
import { z } from "zod";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";

const updateCaseSchema = z.object({
  patientName: z.string().min(1).optional(),
  mrn: z.string().optional(),
  age: z.number().int().positive().optional(),
  gender: z.nativeEnum(Gender).optional(),
  presentingDepartmentId: z.string().optional(),
  clinicalDetails: z.any().optional(), // JSON field
  radiologyFindings: z.any().optional(), // JSON field
  pathologyFindings: z.any().optional(), // JSON field
  diagnosisStage: z.string().optional(),
  treatmentPlan: z.string().optional(),
  question: z.string().optional(),
  assignedMeetingId: z.string().nullable().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string().url() })).optional(),
  followUp: z.string().optional(),
});

/**
 * Helper function to update a SUBMITTED case to PENDING if its meeting date has passed
 */
async function updateCaseStatusIfNeeded(caseId: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Set to start of day for comparison

  // Check if this case should be updated to PENDING
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      status: true,
      assignedMeeting: {
        select: {
          date: true,
        },
      },
      consensusReport: {
        select: {
          id: true,
        },
      },
    },
  });

  // Update to PENDING if: status is SUBMITTED, has assigned meeting, meeting date passed, no consensus
  if (
    caseRecord &&
    caseRecord.status === CaseStatus.SUBMITTED &&
    caseRecord.assignedMeeting &&
    new Date(caseRecord.assignedMeeting.date).setHours(0, 0, 0, 0) < now.getTime() &&
    !caseRecord.consensusReport
  ) {
    await prisma.case.update({
      where: { id: caseId },
      data: {
        status: CaseStatus.PENDING,
      },
    });
  }
}

// GET /api/cases/[id] - Get a single case
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Update case status if needed (SUBMITTED -> PENDING)
    await updateCaseStatusIfNeeded(id);

    // Check if user can view this case
    const canView = await canViewCase(user, id);
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        presentingDepartment: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedMeeting: {
          select: {
            id: true,
            date: true,
            description: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            fileSize: true,
            storageKey: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        specialistsOpinions: {
          include: {
            consultant: {
              select: {
                id: true,
                name: true,
              },
            },
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        consensusReport: {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json(caseRecord);
  } catch (error) {
    console.error("Error fetching case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/cases/[id] - Update a case
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateCaseSchema.parse(body);

    // Get the existing case
    const existingCase = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        patientName: true,
        mrn: true,
        status: true,
        assignedMeetingId: true,
        submittedAt: true,
        assignedMeeting: {
          select: {
            id: true,
            date: true,
            description: true,
          },
        },
      },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Check permissions: Only creator, coordinator, or admin can edit drafts
    if (existingCase.status === CaseStatus.DRAFT) {
      const canEdit = await canEditCase(user, id);
      if (!canEdit) {
        return NextResponse.json(
          { error: "Only the creator, coordinator, or admin can edit draft cases" },
          { status: 403 }
        );
      }
    } else {
      // For non-draft cases, only coordinators/admins can edit
      if (!isCoordinator(user)) {
        return NextResponse.json(
          { error: "Only coordinators or admins can edit submitted cases" },
          { status: 403 }
        );
      }
    }

    // Validate department if being changed
    if (validatedData.presentingDepartmentId) {
      const department = await prisma.department.findUnique({
        where: { id: validatedData.presentingDepartmentId },
      });

      if (!department) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 400 }
        );
      }
    }

    // Validate meeting if being assigned
    if (validatedData.assignedMeetingId !== undefined) {
      if (validatedData.assignedMeetingId !== null) {
        const meeting = await prisma.meeting.findUnique({
          where: { id: validatedData.assignedMeetingId },
          select: { id: true, status: true },
        });

        if (!meeting) {
          return NextResponse.json(
            { error: "Meeting not found" },
            { status: 400 }
          );
        }

        // Prevent assignment to cancelled meetings
        if (meeting.status === "CANCELLED") {
          return NextResponse.json(
            { error: "Cannot assign case to a cancelled meeting" },
            { status: 400 }
          );
        }
      }
    }

    // Prepare update data
    const updateData: any = {};
    
    // Status logic per requirements:
    // - Unassigned cases = DRAFT
    // - Cases assigned to meeting = SUBMITTED (if currently DRAFT or PENDING) or keep current status
    // - Remove from meeting = DRAFT
    if (validatedData.assignedMeetingId !== undefined) {
      if (validatedData.assignedMeetingId !== null) {
        // Assigning to a meeting
        // If current status is DRAFT or PENDING, change to SUBMITTED
        // Otherwise keep current status (e.g., RESUBMITTED stays RESUBMITTED)
        if (existingCase.status === CaseStatus.DRAFT || existingCase.status === CaseStatus.PENDING) {
          updateData.status = CaseStatus.SUBMITTED;
          // Set submittedAt if not already set
          if (!existingCase.submittedAt) {
            updateData.submittedAt = new Date();
          }
        }
        // If status is not DRAFT or PENDING, keep the current status
      } else {
        // Unassigning from meeting - set status to DRAFT
        updateData.status = CaseStatus.DRAFT;
      }
    }
    if (validatedData.patientName !== undefined) updateData.patientName = validatedData.patientName;
    if (validatedData.mrn !== undefined) updateData.mrn = validatedData.mrn;
    if (validatedData.age !== undefined) updateData.age = validatedData.age;
    if (validatedData.gender !== undefined) updateData.gender = validatedData.gender;
    if (validatedData.presentingDepartmentId !== undefined) {
      updateData.presentingDepartmentId = validatedData.presentingDepartmentId;
    }
    if (validatedData.clinicalDetails !== undefined) {
      updateData.clinicalDetails = validatedData.clinicalDetails;
    }
    if (validatedData.radiologyFindings !== undefined) {
      updateData.radiologyFindings = validatedData.radiologyFindings;
    }
    if (validatedData.pathologyFindings !== undefined) {
      updateData.pathologyFindings = validatedData.pathologyFindings;
    }
    if (validatedData.diagnosisStage !== undefined) {
      updateData.diagnosisStage = validatedData.diagnosisStage;
    }
    if (validatedData.treatmentPlan !== undefined) {
      updateData.treatmentPlan = validatedData.treatmentPlan;
    }
    if (validatedData.question !== undefined) {
      updateData.question = validatedData.question;
    }
    if (validatedData.assignedMeetingId !== undefined) {
      updateData.assignedMeetingId = validatedData.assignedMeetingId;
      // Status is already set above based on whether meeting is assigned or unassigned
    }
    if (validatedData.links !== undefined) {
      updateData.links = validatedData.links;
    }
    if (validatedData.followUp !== undefined) {
      updateData.followUp = validatedData.followUp;
    }

    const updatedCase = await prisma.case.update({
      where: { id },
      data: updateData,
      include: {
        presentingDepartment: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedMeeting: {
          select: {
            id: true,
            date: true,
            description: true,
          },
        },
      },
    });

    // Log audit entry
    await createAuditLog({
      action: AuditAction.CASE_UPDATE,
      userId: user.id,
      caseId: id,
      details: {
        patientName: updatedCase.patientName,
        mrn: updatedCase.mrn,
        previousStatus: existingCase.status,
        newStatus: updatedCase.status,
        changes: Object.keys(updateData),
      },
      ipAddress: getIpAddress(request.headers),
    });

    // Notify creator + department consultants if the case is moved to another meeting (postponed)
    const previousMeetingId = existingCase.assignedMeetingId;
    const newMeetingId = validatedData.assignedMeetingId ?? existingCase.assignedMeetingId;
    if (
      previousMeetingId &&
      newMeetingId &&
      newMeetingId !== previousMeetingId &&
      updatedCase.assignedMeeting
    ) {
      const recipients = new Set<string>();
      if (updatedCase.createdBy.id) {
        recipients.add(updatedCase.createdBy.id);
      }
      if (updatedCase.presentingDepartment) {
        const deptConsultants = await prisma.user.findMany({
          where: {
            departmentId: updatedCase.presentingDepartment.id,
            role: "Consultant",
          },
          select: { id: true },
        });
        deptConsultants.forEach((u) => recipients.add(u.id));
      }

      if (recipients.size > 0) {
        const meetingDateStr = updatedCase.assignedMeeting.date.toLocaleDateString();
        const prevDate = existingCase.assignedMeeting?.date
          ? new Date(existingCase.assignedMeeting.date)
          : null;
        const isEarlier =
          prevDate &&
          new Date(updatedCase.assignedMeeting.date).getTime() < prevDate.getTime();
        const title = isEarlier
          ? "Case Preponed to Earlier Meeting"
          : "Case Postponed to Next Meeting";
        const verb = isEarlier ? "advanced to" : "moved to";
        await createNotificationsForUsers(Array.from(recipients), {
          type: NotificationType.CASE_POSTPONED,
          title,
          message: `Case ${updatedCase.patientName} from ${updatedCase.presentingDepartment.name} ${verb} MDT meeting on ${meetingDateStr}${updatedCase.assignedMeeting.description ? `: ${updatedCase.assignedMeeting.description}` : ""}`,
          meetingId: updatedCase.assignedMeeting.id,
          caseId: updatedCase.id,
        });
      }
    }

    return NextResponse.json(updatedCase);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/cases/[id] - Delete a case
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get the existing case
    const existingCase = await prisma.case.findUnique({
      where: { id },
      select: { 
        id: true, 
        patientName: true,
        mrn: true,
        status: true, 
        createdById: true 
      },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Check permissions: Only creator, coordinator, or admin can delete cases
    const isCreator = existingCase.createdById === user.id;
    const isCoord = isCoordinator(user);
    
    if (!isCreator && !isCoord) {
      return NextResponse.json(
        { error: "Only the creator, coordinator, or admin can delete cases" },
        { status: 403 }
      );
    }

    // Can only delete DRAFT, SUBMITTED, or PENDING cases
    // Cannot delete REVIEWED, RESUBMITTED, or ARCHIVED cases
    if (existingCase.status !== CaseStatus.DRAFT && existingCase.status !== CaseStatus.SUBMITTED && existingCase.status !== CaseStatus.PENDING) {
      return NextResponse.json(
        { error: "Only draft, submitted, or pending cases can be deleted" },
        { status: 400 }
      );
    }

    // Log audit entry before deletion
    await createAuditLog({
      action: AuditAction.CASE_DELETE,
      userId: user.id,
      caseId: id,
      details: {
        patientName: existingCase.patientName,
        mrn: existingCase.mrn,
        status: existingCase.status,
      },
      ipAddress: getIpAddress(request.headers),
    });

    // Delete the case (cascade will handle related records)
    await prisma.case.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Case deleted successfully" });
  } catch (error) {
    console.error("Error deleting case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

