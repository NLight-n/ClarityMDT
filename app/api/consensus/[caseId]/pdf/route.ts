import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { generateConsensusPDF } from "@/lib/pdf/consensusTemplate";
import { generatePresignedUrl } from "@/lib/minio/generatePresignedUrl";

/**
 * GET /api/consensus/[caseId]/pdf - Generate and download consensus report PDF
 * Returns PDF buffer for download
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { caseId } = await params;

    // Verify that the case exists and user can view it
    const canView = await canViewCase(user, caseId);
    if (!canView) {
      return NextResponse.json(
        { error: "Case not found or access denied" },
        { status: 404 }
      );
    }

    // Fetch case data with all related information
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        presentingDepartment: {
          select: {
            name: true,
          },
        },
        consensusReport: {
          include: {
            createdBy: {
              select: {
                name: true,
              },
            },
          },
        },
        specialistsOpinions: {
          include: {
            consultant: {
              select: {
                name: true,
              },
            },
            department: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!caseData) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Check if consensus report exists
    if (!caseData.consensusReport) {
      return NextResponse.json(
        { error: "Consensus report not found for this case" },
        { status: 404 }
      );
    }

    // Get selected sections from query parameters
    const searchParams = request.nextUrl.searchParams;
    const sectionsParam = searchParams.getAll("sections");
    const selectedSections = sectionsParam.length > 0 
      ? sectionsParam 
      : ["patientDetails", "clinicalDetails", "finalDiagnosis", "consensusReport"]; // Default sections

    // Get selected attendee IDs from query parameters
    const attendeeIdsParam = searchParams.getAll("attendeeIds");
    let selectedAttendees: any[] = [];

    if (attendeeIdsParam.length > 0) {
      // Fetch meeting attendees if case has an assigned meeting
      if (caseData.assignedMeetingId) {
        const meeting = await prisma.meeting.findUnique({
          where: { id: caseData.assignedMeetingId },
          include: {
            attendees: {
              where: {
                userId: { in: attendeeIdsParam },
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                    signatureUrl: true,
                    signatureAuthenticated: true,
                    department: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (meeting) {
          // Process all selected attendees (with or without signatures)
          selectedAttendees = await Promise.all(
            meeting.attendees.map(async (attendee) => {
              const hasSignature = attendee.user.signatureUrl && attendee.user.signatureAuthenticated;
              
              if (hasSignature) {
                try {
                  // Generate presigned URL and fetch image
                  const imageUrl = await generatePresignedUrl(
                    attendee.user.signatureUrl!,
                    3600 // 1 hour expiry
                  );
                  
                  // Fetch the image
                  const imageResponse = await fetch(imageUrl);
                  if (imageResponse.ok) {
                    const imageBuffer = await imageResponse.arrayBuffer();
                    return {
                      userId: attendee.user.id,
                      name: attendee.user.name,
                      role: attendee.user.role,
                      department: attendee.user.department?.name || null,
                      signatureUrl: attendee.user.signatureUrl,
                      signatureImage: new Uint8Array(imageBuffer),
                    };
                  }
                } catch (error) {
                  console.error(`Error fetching signature for ${attendee.user.name}:`, error);
                }
              }
              
              // Return attendee without signature (will show blank space in PDF)
              return {
                userId: attendee.user.id,
                name: attendee.user.name,
                role: attendee.user.role,
                department: attendee.user.department?.name || null,
                signatureUrl: null,
                signatureImage: undefined,
              };
            })
          );
          
          // Sort attendees: Coordinators first, then others
          // Filter out any null entries first
          selectedAttendees = selectedAttendees.filter(a => a !== null);
          
          selectedAttendees.sort((a, b) => {
            const aIsCoordinator = a.role === "Coordinator" || a.role === "Admin";
            const bIsCoordinator = b.role === "Coordinator" || b.role === "Admin";
            
            if (aIsCoordinator && !bIsCoordinator) return -1;
            if (!aIsCoordinator && bIsCoordinator) return 1;
            return 0; // Keep original order for same type
          });
        }
      }
    }

    // Fetch hospital settings for header
    const hospitalSettings = await prisma.hospitalSettings.findFirst();

    // Generate PDF with selected sections, hospital settings, and attendee signatures
    const pdfBuffer = await generateConsensusPDF(
      caseData as any, 
      selectedSections,
      hospitalSettings ? { name: hospitalSettings.name, logoUrl: hospitalSettings.logoUrl } : null,
      selectedAttendees.length > 0 ? selectedAttendees : undefined
    );

    // Convert Buffer to Uint8Array for Next.js Response
    const pdfArray = new Uint8Array(pdfBuffer);

    // Return PDF as response
    return new Response(pdfArray, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="consensus-report-${caseData.patientName.replace(/\s+/g, "-")}-${caseId.substring(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}

