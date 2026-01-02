import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase, isCoordinator, isConsultant, isAdmin } from "@/lib/permissions/accessControl";
import { CaseStatus, Gender } from "@prisma/client";
import { z } from "zod";

const createCaseSchema = z.object({
  patientName: z.string().min(1, "Patient name is required"),
  mrn: z.string().optional(),
  age: z.number().int().positive("Age must be a positive number"),
  gender: z.nativeEnum(Gender),
  presentingDepartmentId: z.string().min(1, "Presenting department is required"),
  clinicalDetails: z.any(), // JSON field (ProseMirror format)
  radiologyFindings: z.any().optional(), // JSON field
  pathologyFindings: z.any().optional(), // JSON field
  diagnosisStage: z.string().min(1, "Diagnosis stage is required"),
  treatmentPlan: z.string().optional(),
  question: z.string().min(1, "Discussion question is required"),
  links: z.array(z.object({ label: z.string(), url: z.string().url() })).optional(),
});

/**
 * Helper function to update SUBMITTED cases to PENDING if their meeting date has passed
 * This should be called before fetching cases to ensure statuses are up-to-date
 */
async function updateSubmittedCasesToPending() {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Set to start of day for comparison

  // Find all SUBMITTED cases with assigned meetings where the meeting date has passed
  const submittedCasesToUpdate = await prisma.case.findMany({
    where: {
      status: CaseStatus.SUBMITTED,
      assignedMeetingId: { not: null },
      assignedMeeting: {
        date: { lt: now },
      },
      // Only update cases that don't have a consensus report (if they had consensus, they would be REVIEWED)
      consensusReport: null,
    },
    select: {
      id: true,
    },
  });

  // Update all found cases to PENDING status
  if (submittedCasesToUpdate.length > 0) {
    await prisma.case.updateMany({
      where: {
        id: { in: submittedCasesToUpdate.map((c) => c.id) },
      },
      data: {
        status: CaseStatus.PENDING,
      },
    });
  }
}

// GET /api/cases - List cases (with filtering)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update SUBMITTED cases to PENDING if their meeting date has passed
    await updateSubmittedCasesToPending();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as CaseStatus | null;
    const departmentId = searchParams.get("departmentId");
    const meetingId = searchParams.get("meetingId");
    const search = searchParams.get("search"); // Search query for patientName, MRN, or diagnosisStage

    // Build where clause based on user role
    let where: any = {};

    // Search functionality - searches across patientName, MRN, and diagnosisStage
    // When search is active, it searches across all cases but can still be combined with status filter
    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { patientName: { contains: searchTerm, mode: "insensitive" } },
        { mrn: { contains: searchTerm, mode: "insensitive" } },
        { diagnosisStage: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Filter by status if provided (works with or without search)
    if (status) {
      where.status = status;
    }

    // Filter by meeting if provided (applied first)
    if (meetingId) {
      where.assignedMeetingId = meetingId;
    }

    // Role-based filtering - apply AFTER meeting filter
    // Note: When viewing meeting cases, consultants should see ALL cases in the meeting (not just their department)
    // so they can provide opinions on any case
    // When search is active, consultants can see all matching cases (not just their department)
    if (isCoordinator(user)) {
      // Coordinators and Admins can see all cases
      // No additional filter needed
    } else if (isConsultant(user)) {
      // Consultants can only see cases in their department
      // BUT: Skip department filter when:
      // 1. Viewing a specific meeting (so they can see all meeting cases to provide opinions)
      // 2. Search is active (so they can see search results from all departments)
      if (!meetingId && !search && user.departmentId) {
        where.presentingDepartmentId = user.departmentId;
      } else if (!meetingId && !search && !user.departmentId) {
        // Consultant without department sees nothing (only when not viewing a meeting and no search)
        return NextResponse.json([]);
      }
      // If meetingId or search is provided, consultants can see all cases in that meeting/search
    } else {
      // Viewers can see all cases
      // No additional filter needed
    }

    // Filter by department if provided (only if not already set by role-based filtering and search is not active)
    // When search is active, department filter is ignored to allow searching across all departments
    if (departmentId && !where.presentingDepartmentId && (!search || !search.trim())) {
      where.presentingDepartmentId = departmentId;
    }

    // Debug logging (can be removed in production)
    if (meetingId) {
      console.log(`[Cases API] Fetching cases for meeting ${meetingId}, where clause:`, JSON.stringify(where));
    }

    const cases = await prisma.case.findMany({
      where,
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
        _count: {
          select: {
            attachments: true,
            specialistsOpinions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(cases);
  } catch (error) {
    console.error("Error fetching cases:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/cases - Create a new case
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Consultants and Coordinators can create cases
    if (!isConsultant(user) && !isCoordinator(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createCaseSchema.parse(body);

    // Validate department exists
    const department = await prisma.department.findUnique({
      where: { id: validatedData.presentingDepartmentId },
    });

    if (!department) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 400 }
      );
    }

    // If user is a Coordinator with a department, they can only create cases for their own department
    // (Acting like a consultant for their department)
    if (isCoordinator(user) && user.departmentId && !isAdmin(user)) {
      if (validatedData.presentingDepartmentId !== user.departmentId) {
        return NextResponse.json(
          { error: "Coordinators with a department can only create cases for their own department" },
          { status: 403 }
        );
      }
    }

    // If user is a Consultant, they can only create cases for their own department
    if (isConsultant(user) && user.departmentId) {
      if (validatedData.presentingDepartmentId !== user.departmentId) {
        return NextResponse.json(
          { error: "Consultants can only create cases for their own department" },
          { status: 403 }
        );
      }
    }

    // Initialize JSON fields if not provided
    const radiologyFindings = validatedData.radiologyFindings || { type: "doc", content: [] };
    const pathologyFindings = validatedData.pathologyFindings || { type: "doc", content: [] };

    const newCase = await prisma.case.create({
      data: {
        patientName: validatedData.patientName,
        mrn: validatedData.mrn,
        age: validatedData.age,
        gender: validatedData.gender,
        presentingDepartmentId: validatedData.presentingDepartmentId,
        clinicalDetails: validatedData.clinicalDetails,
        radiologyFindings: radiologyFindings,
        pathologyFindings: pathologyFindings,
        diagnosisStage: validatedData.diagnosisStage,
        treatmentPlan: validatedData.treatmentPlan || "",
        question: validatedData.question,
        links: validatedData.links && validatedData.links.length > 0 ? validatedData.links : undefined,
        status: CaseStatus.DRAFT,
        createdById: user.id,
      },
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
      },
    });

    return NextResponse.json(newCase, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error creating case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

