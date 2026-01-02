import { NextRequest, NextResponse } from "next/server";
import { signIn } from "next-auth/react";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { loginId, password } = body;

    if (!loginId || !password) {
      return NextResponse.json(
        { error: "Login ID and password are required" },
        { status: 400 }
      );
    }

    // Note: In NextAuth v5, signIn is a server action
    // For App Router, we'll use the standard NextAuth API
    return NextResponse.json(
      { message: "Use /api/auth/signin/credentials endpoint" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

