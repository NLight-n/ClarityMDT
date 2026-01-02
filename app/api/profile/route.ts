import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  loginId: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  oldPassword: z.string().optional(), // Required when password is being changed
  phoneNumber: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  medicalCouncilNumber: z.string().optional().nullable(),
  degrees: z.string().optional().nullable(),
});

// GET /api/profile - Get current user's profile
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: userData.id,
      name: userData.name,
      loginId: userData.loginId,
      role: userData.role,
      departmentId: userData.departmentId,
      department: userData.department,
      signatureUrl: userData.signatureUrl,
      signatureAuthenticated: userData.signatureAuthenticated,
      telegramId: userData.telegramId,
      phoneNumber: userData.phoneNumber,
      email: userData.email,
      medicalCouncilNumber: userData.medicalCouncilNumber,
      degrees: userData.degrees,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/profile - Update current user's profile
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateProfileSchema.parse(body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if loginId is being changed and if it's already taken
    if (validatedData.loginId && validatedData.loginId !== existingUser.loginId) {
      const loginIdExists = await prisma.user.findUnique({
        where: { loginId: validatedData.loginId },
      });

      if (loginIdExists) {
        return NextResponse.json(
          { error: "Login ID already exists" },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (validatedData.name !== undefined) {
      updateData.name = validatedData.name.trim();
    }
    if (validatedData.loginId !== undefined) {
      updateData.loginId = validatedData.loginId.trim();
    }

    // Hash password if provided - but first verify old password
    if (validatedData.password) {
      // Old password is required when changing password
      if (!validatedData.oldPassword) {
        return NextResponse.json(
          { error: "Old password is required to change password" },
          { status: 400 }
        );
      }

      // Verify old password
      const isOldPasswordValid = await bcrypt.compare(
        validatedData.oldPassword,
        existingUser.passwordHash
      );

      if (!isOldPasswordValid) {
        return NextResponse.json(
          { error: "Old password is incorrect" },
          { status: 400 }
        );
      }

      // Old password is correct, hash the new password
      updateData.passwordHash = await bcrypt.hash(validatedData.password, 10);
    }

    // Optional profile fields
    if (validatedData.phoneNumber !== undefined) {
      updateData.phoneNumber = validatedData.phoneNumber?.trim() || null;
    }
    if (validatedData.email !== undefined) {
      const emailValue = validatedData.email?.trim() || null;
      // Only validate email format if a value is provided
      if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }
      updateData.email = emailValue;
    }
    if (validatedData.medicalCouncilNumber !== undefined) {
      updateData.medicalCouncilNumber = validatedData.medicalCouncilNumber?.trim() || null;
    }
    if (validatedData.degrees !== undefined) {
      updateData.degrees = validatedData.degrees?.trim() || null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: updatedUser.id,
      name: updatedUser.name,
      loginId: updatedUser.loginId,
      role: updatedUser.role,
      departmentId: updatedUser.departmentId,
      departmentName: updatedUser.department?.name || null,
      phoneNumber: updatedUser.phoneNumber,
      email: updatedUser.email,
      medicalCouncilNumber: updatedUser.medicalCouncilNumber,
      degrees: updatedUser.degrees,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

