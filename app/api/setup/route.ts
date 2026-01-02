import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

/**
 * POST /api/setup - Create initial admin user if no users exist
 * This endpoint can only be called when there are no users in the database
 */
export async function POST(request: NextRequest) {
  try {
    // Check if any users exist
    const userCount = await prisma.user.count();

    if (userCount > 0) {
      return NextResponse.json(
        { error: "Initial setup already completed. Users exist in the database." },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, loginId, password } = body;

    // Validate input
    if (!name || !loginId || !password) {
      return NextResponse.json(
        { error: "Name, loginId, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Check if loginId already exists (shouldn't, but just in case)
    const existingUser = await prisma.user.findUnique({
      where: { loginId },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this login ID already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        name,
        loginId,
        passwordHash,
        role: Role.Admin,
      },
      select: {
        id: true,
        name: true,
        loginId: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Initial admin user created successfully",
        user: adminUser,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error during setup:", error);
    return NextResponse.json(
      { error: "Failed to create initial user" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/setup - Check if initial setup is needed
 */
export async function GET() {
  try {
    const userCount = await prisma.user.count();
    return NextResponse.json({
      setupRequired: userCount === 0,
      userCount,
    });
  } catch (error) {
    console.error("Error checking setup status:", error);
    return NextResponse.json(
      { error: "Failed to check setup status" },
      { status: 500 }
    );
  }
}


