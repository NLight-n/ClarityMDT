import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import { z } from "zod";

const createDepartmentSchema = z.object({
  name: z.string().min(1, "Department name is required"),
});

// GET /api/departments - List all departments
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // All authenticated users can view departments
    const departments = await prisma.department.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            cases: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    // Format the response to include user and case counts
    const formattedDepartments = departments.map((dept) => ({
      id: dept.id,
      name: dept.name,
      userCount: dept._count.users,
      caseCount: dept._count.cases,
      createdAt: dept.createdAt,
      updatedAt: dept.updatedAt,
    }));

    return NextResponse.json(formattedDepartments);
  } catch (error) {
    console.error("Error fetching departments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/departments - Create a new department
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin can create departments
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createDepartmentSchema.parse(body);

    // Check if department name already exists
    const existingDepartment = await prisma.department.findUnique({
      where: { name: validatedData.name },
    });

    if (existingDepartment) {
      return NextResponse.json(
        { error: "Department name already exists" },
        { status: 400 }
      );
    }

    const newDepartment = await prisma.department.create({
      data: {
        name: validatedData.name,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            cases: true,
          },
        },
      },
    });

    const formattedDepartment = {
      id: newDepartment.id,
      name: newDepartment.name,
      userCount: newDepartment._count.users,
      caseCount: newDepartment._count.cases,
      createdAt: newDepartment.createdAt,
      updatedAt: newDepartment.updatedAt,
    };

    // Log audit entry
    await createAuditLog({
      action: AuditAction.DEPARTMENT_CREATE,
      userId: user.id,
      details: {
        departmentId: newDepartment.id,
        departmentName: newDepartment.name,
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json(formattedDepartment, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error creating department:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

