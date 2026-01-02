import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";

/**
 * GET /api/users/search - Search for users (consultants and coordinators)
 * Used for attendee selection
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";

    // Search for consultants and coordinators (including admins)
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["Consultant", "Coordinator", "Admin"] },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { loginId: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        loginId: true,
        role: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      take: 50, // Limit results
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

