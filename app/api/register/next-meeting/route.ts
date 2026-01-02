import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { CaseStatus } from "@prisma/client";

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

/**
 * GET /api/register/next-meeting - Get the next upcoming meeting with cases
 * Returns the next upcoming meeting (or specified meeting) with its cases
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update SUBMITTED cases to PENDING if their meeting date has passed
    await updateSubmittedCasesToPending();

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get("meetingId");

    let meeting;

    if (meetingId) {
      // Get specific meeting (exclude cancelled)
      meeting = await prisma.meeting.findFirst({
        where: { 
          id: meetingId,
          status: { not: "CANCELLED" }
        },
        include: {
          cases: {
            select: {
              id: true,
              patientName: true,
              mrn: true,
              age: true,
              gender: true,
              clinicalDetails: true,
              diagnosisStage: true,
              status: true,
              radiologyFindings: true,
              pathologyFindings: true,
              followUp: true,
              presentingDepartment: {
                select: {
                  name: true,
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
              createdAt: "asc",
            },
          },
        },
      });
    } else {
      // Get next upcoming meeting (exclude cancelled)
      const now = new Date();
      meeting = await prisma.meeting.findFirst({
        where: {
          date: {
            gte: now,
          },
          status: { not: "CANCELLED" },
        },
        include: {
          cases: {
            select: {
              id: true,
              patientName: true,
              mrn: true,
              age: true,
              gender: true,
              clinicalDetails: true,
              diagnosisStage: true,
              status: true,
              radiologyFindings: true,
              pathologyFindings: true,
              followUp: true,
              presentingDepartment: {
                select: {
                  name: true,
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
              createdAt: "asc",
            },
          },
        },
        orderBy: {
          date: "asc",
        },
      });
    }

    if (!meeting) {
      return NextResponse.json(
        { error: "No meeting found" },
        { status: 404 }
      );
    }

    return NextResponse.json(meeting);
  } catch (error) {
    console.error("Error fetching next meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

