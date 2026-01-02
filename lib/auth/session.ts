import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { authOptions } from "./authOptions";

export async function getSession(request?: NextRequest) {
  // This will be used in server components/pages
  // For now, return null and handle via middleware
  return null;
}

export async function getCurrentUser(request?: NextRequest) {
  if (!request) return null;
  
  const token = await getToken({ 
    req: request,
    secret: process.env.NEXTAUTH_SECRET 
  });
  
  if (!token) return null;
  
  return {
    id: token.userId as string,
    name: token.name as string,
    loginId: token.loginId as string,
    role: token.role,
    departmentId: token.departmentId as string | null,
  };
}

// For backwards compatibility, export authOptions
export { authOptions };

