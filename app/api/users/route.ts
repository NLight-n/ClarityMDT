import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin, isCoordinator } from "@/lib/permissions/accessControl";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  loginId: z.string().min(1, "Login ID is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.nativeEnum(Role),
  departmentId: z.string().nullable().optional(),
});

// GET /api/users - List all users
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin and Coordinator can list all users
    if (!isAdmin(user) && !isCoordinator(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        loginId: true,
        role: true,
        previousRole: true,
        departmentId: true,
        signatureUrl: true,
        signatureAuthenticated: true,
        telegramId: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/users - Create a new user
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin and Coordinator can create users
    if (!isAdmin(user) && !isCoordinator(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createUserSchema.parse(body);

    // Coordinators cannot create Admin or Coordinator roles
    if (!isAdmin(user) && (validatedData.role === Role.Admin || validatedData.role === Role.Coordinator)) {
      return NextResponse.json(
        { error: "Coordinators cannot create Admin or Coordinator roles" },
        { status: 403 }
      );
    }

    // Check if loginId already exists
    const existingUser = await prisma.user.findUnique({
      where: { loginId: validatedData.loginId },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Login ID already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(validatedData.password, 10);

    // Validate departmentId if provided
    if (validatedData.departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: validatedData.departmentId },
      });

      if (!department) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 400 }
        );
      }
    }

    // Validate department requirement based on role
    if (
      (validatedData.role === Role.Consultant ||
        validatedData.role === Role.Coordinator) &&
      !validatedData.departmentId
    ) {
      return NextResponse.json(
        { error: "Department is required for Consultant and Coordinator roles" },
        { status: 400 }
      );
    }

    const newUser = await prisma.user.create({
      data: {
        name: validatedData.name,
        loginId: validatedData.loginId,
        passwordHash,
        role: validatedData.role,
        departmentId: validatedData.departmentId || null,
      },
      select: {
        id: true,
        name: true,
        loginId: true,
        role: true,
        previousRole: true,
        departmentId: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log audit entry
    await createAuditLog({
      action: AuditAction.USER_CREATE,
      userId: user.id,
      targetUserId: newUser.id,
      details: {
        userName: newUser.name,
        loginId: newUser.loginId,
        role: newUser.role,
        departmentId: newUser.departmentId,
        departmentName: newUser.department?.name || null,
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

