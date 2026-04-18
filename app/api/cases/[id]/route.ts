import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase, canViewCase, isCoordinator } from "@/lib/permissions/accessControl";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import { CaseStatus, Gender, NotificationType } from "@prisma/client";
import { z } from "zod";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";
import { encryptCaseData, decryptCaseData } from "@/lib/security/phiCaseWrapper";
import { getObjectsSizeByPrefix } from "@/lib/minio/delete";

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
  concernedDepartmentIds: z.array(z.string()).optional(),
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
            isDicomBundle: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        dicomFiles: {
          select: {
            id: true,
            fileName: true,
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

    // HIPAA Compliance: Decrypt PHI fields before returning
    const decryptedCase = decryptCaseData(caseRecord);

    if (!decryptedCase) {
       return NextResponse.json({ error: "Failed to decrypt case" }, { status: 500 });
    }

    // Calculate real sizes for DICOM bundles
    if (decryptedCase.attachments) {
      decryptedCase.attachments = await Promise.all(
        decryptedCase.attachments.map(async (attachment: any) => {
          if (attachment.isDicomBundle) {
            try {
              const { getDicomManifestRealSize } = await import("@/lib/minio");
              const realSize = await getDicomManifestRealSize(attachment.storageKey);
              return { ...attachment, realSize };
            } catch (e) {
              console.error(`Failed to calculate real size for bundle ${attachment.id}:`, e);
            }
          }
          return attachment;
        })
      );
    }

    return NextResponse.json(decryptedCase);
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

    // Get the existing case with all relevant fields for change tracking
    const existingCase = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        patientName: true,
        mrn: true,
        age: true,
        gender: true,
        presentingDepartmentId: true,
        clinicalDetails: true,
        radiologyFindings: true,
        pathologyFindings: true,
        diagnosisStage: true,
        treatmentPlan: true,
        question: true,
        concernedDepartmentIds: true,
        status: true,
        assignedMeetingId: true,
        submittedAt: true,
        links: true,
        followUp: true,
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

    // Check general edit permissions
    const canEdit = await canEditCase(user, id);
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit this case" },
        { status: 403 }
      );
    }

    // Check status-based permissions:
    // Only coordinators or admins can edit REVIEWED or ARCHIVED cases
    if (
      existingCase.status === CaseStatus.REVIEWED ||
      existingCase.status === CaseStatus.ARCHIVED
    ) {
      if (!isCoordinator(user)) {
        return NextResponse.json(
          { error: "Only coordinators or admins can edit reviewed or archived cases" },
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

    if (validatedData.concernedDepartmentIds !== undefined) {
      const uniqueIds = Array.from(new Set(validatedData.concernedDepartmentIds));
      if (uniqueIds.length > 0) {
        const existingDepartments = await prisma.department.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true },
        });
        if (existingDepartments.length !== uniqueIds.length) {
          return NextResponse.json(
            { error: "One or more concerned departments are invalid" },
            { status: 400 }
          );
        }
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

    // Prepare update data and track changes for audit logging
    const updateData: any = {};
    
    // Decrypt existing PHI for accurate comparison
    const decryptedExisting = decryptCaseData({
        patientName: existingCase.patientName,
        mrn: existingCase.mrn
    });

    if (!decryptedExisting) {
        return NextResponse.json({ error: "Failed to decrypt case data" }, { status: 500 });
    }

    const auditDetails: any = {
      patientName: existingCase.patientName, // Keep encrypted for identification in log record
      mrn: existingCase.mrn, // Keep encrypted for identification in log record
      changes: {} as Record<string, { old: any, new: any }>,
    };

    const trackChange = (field: string, oldValue: any, newValue: any) => {
        // Handle deep equality for JSON fields and arrays
        const oldStr = JSON.stringify(oldValue);
        const newStr = JSON.stringify(newValue);
        if (oldStr !== newStr) {
            auditDetails.changes[field] = { old: oldValue, new: newValue };
            return true;
        }
        return false;
    };

    // Status logic per requirements:
    if (validatedData.assignedMeetingId !== undefined) {
      if (validatedData.assignedMeetingId !== null) {
        if (existingCase.status === CaseStatus.DRAFT || existingCase.status === CaseStatus.PENDING) {
          updateData.status = CaseStatus.SUBMITTED;
          trackChange("status", existingCase.status, CaseStatus.SUBMITTED);
          if (!existingCase.submittedAt) {
            updateData.submittedAt = new Date();
          }
        }
      } else {
        updateData.status = CaseStatus.DRAFT;
        trackChange("status", existingCase.status, CaseStatus.DRAFT);
      }
    }

    // PHI fields - compare plaintext to plaintext
    if (validatedData.patientName !== undefined) {
      if (trackChange("patientName", decryptedExisting.patientName, validatedData.patientName)) {
        const encrypted = encryptCaseData({ patientName: validatedData.patientName }).patientName;
        updateData.patientName = encrypted;
        // In audit logs, we store the decrypted values for the change comparison table
        // (the API route app/api/audit-logs/route.ts handles decryption for viewing)
      }
    }
    if (validatedData.mrn !== undefined) {
      if (trackChange("mrn", decryptedExisting.mrn, validatedData.mrn)) {
        const encrypted = encryptCaseData({ mrn: validatedData.mrn }).mrn;
        updateData.mrn = encrypted;
      }
    }

    // Other simple fields
    const simpleFields = ["age", "gender", "presentingDepartmentId", "diagnosisStage", "treatmentPlan", "question", "assignedMeetingId", "followUp"];
    for (const field of simpleFields) {
      if ((validatedData as any)[field] !== undefined) {
        if (trackChange(field, (existingCase as any)[field], (validatedData as any)[field])) {
            updateData[field] = (validatedData as any)[field];
        }
      }
    }

    // JSON fields
    const jsonFields = ["clinicalDetails", "radiologyFindings", "pathologyFindings", "links"];
    for (const field of jsonFields) {
      if ((validatedData as any)[field] !== undefined) {
        if (trackChange(field, (existingCase as any)[field], (validatedData as any)[field])) {
            updateData[field] = (validatedData as any)[field];
        }
      }
    }

    // Handle concernedDepartmentIds separately — resolve IDs to department names for audit logging
    if (validatedData.concernedDepartmentIds !== undefined) {
      const oldIds: string[] = Array.isArray((existingCase as any).concernedDepartmentIds)
        ? (existingCase as any).concernedDepartmentIds
        : [];
      const newIds: string[] = validatedData.concernedDepartmentIds;
      const oldStr = JSON.stringify(oldIds);
      const newStr = JSON.stringify(newIds);

      if (oldStr !== newStr) {
        updateData.concernedDepartmentIds = newIds;

        // Collect all unique IDs to resolve names
        const allDeptIds = Array.from(new Set([...oldIds, ...newIds]));
        const departments = allDeptIds.length > 0
          ? await prisma.department.findMany({
              where: { id: { in: allDeptIds } },
              select: { id: true, name: true },
            })
          : [];
        const deptNameMap = new Map(departments.map((d) => [d.id, d.name]));

        const resolveNames = (ids: string[]) =>
          ids.map((id) => deptNameMap.get(id) || id);

        // Store with a friendlier key so the UI shows "Concerned Departments"
        auditDetails.changes["concernedDepartments"] = {
          old: resolveNames(oldIds),
          new: resolveNames(newIds),
        };
      }
    }

    const hasCaseChanges = Object.keys(auditDetails.changes).length > 0;

    if (!hasCaseChanges) {
      const unchangedCase = await prisma.case.findUnique({
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
        },
      });

      return NextResponse.json(unchangedCase);
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
    const decryptedUpdatedCase = decryptCaseData(updatedCase);

    // Log audit entry only when case fields actually changed.
    await createAuditLog({
      action: AuditAction.CASE_UPDATE,
      userId: user.id,
      caseId: id,
      details: auditDetails,
      ipAddress: getIpAddress(request.headers),
    });

    // Notify creator + department consultants if the case is moved to another meeting (postponed)
    const previousMeetingId = existingCase.assignedMeetingId;
    const newMeetingId = validatedData.assignedMeetingId ?? existingCase.assignedMeetingId;
    if (
      previousMeetingId &&
      newMeetingId &&
      newMeetingId !== previousMeetingId &&
      updatedCase.assignedMeeting &&
      decryptedUpdatedCase
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
        const patientLabel = `${decryptedUpdatedCase.patientName} (MRN: ${decryptedUpdatedCase.mrn || "N/A"})`;
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
          message: `Case ${patientLabel} from ${updatedCase.presentingDepartment.name} ${verb} MDT meeting on ${meetingDateStr}${updatedCase.assignedMeeting.description ? `: ${updatedCase.assignedMeeting.description}` : ""}`,
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
