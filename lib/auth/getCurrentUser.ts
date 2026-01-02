import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

export interface CurrentUser {
  id: string;
  name: string;
  loginId: string;
  role: Role;
  departmentId: string | null;
}

export async function getCurrentUserFromRequest(
  request: NextRequest
): Promise<CurrentUser | null> {
  // Ensure NEXTAUTH_SECRET is available
  if (!process.env.NEXTAUTH_SECRET) {
    console.error("NEXTAUTH_SECRET is not set");
    return null;
  }

  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: "next-auth.session-token", // Match the cookie name from authOptions
    });

    // Strict validation: token must exist and have all required fields
    if (
      !token ||
      typeof token !== "object" ||
      !token.userId ||
      typeof token.userId !== "string" ||
      token.userId.length === 0 ||
      !token.role ||
      typeof token.role !== "string" ||
      token.role.length === 0
    ) {
      // Debug: log when token validation fails (remove in production if too verbose)
      if (process.env.NODE_ENV === "development") {
        console.log("[getCurrentUser] Token validation failed:", {
          hasToken: !!token,
          tokenType: typeof token,
          hasUserId: !!(token && token.userId),
          hasRole: !!(token && token.role),
        });
      }
      return null;
    }

    return {
      id: token.userId as string,
      name: (token.name as string) || "",
      loginId: (token.loginId as string) || "",
      role: token.role as Role,
      departmentId: (token.departmentId as string | null) || null,
    };
  } catch (error) {
    console.error("Error getting current user from request:", error);
    return null;
  }
}

