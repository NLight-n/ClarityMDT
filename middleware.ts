import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * HIPAA Compliance Middleware
 * - HTTPS enforcement (configurable)
 * - Session validation
 * - Security headers
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // HIPAA Compliance: HTTPS Enforcement
  // Enable via ENFORCE_HTTPS=true in production
  // This redirects HTTP to HTTPS when enabled
  const enforceHttps = process.env.ENFORCE_HTTPS === "true";
  const protocol = request.headers.get("x-forwarded-proto") ||
    (request.url.startsWith("https") ? "https" : "http");

  if (enforceHttps && protocol === "http") {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = "https:";
    return NextResponse.redirect(httpsUrl.toString(), 301);
  }

  // Allow access to login page, setup page, and API auth routes
  // Also allow public API routes that don't require authentication
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/api/hospital-settings") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico")
  ) {
    const response = NextResponse.next();

    // Add HSTS header for HTTPS connections
    if (protocol === "https") {
      response.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
    }

    return response;
  }

  // Ensure NEXTAUTH_SECRET is available
  if (!process.env.NEXTAUTH_SECRET) {
    console.error("NEXTAUTH_SECRET is not set");
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Get token from request - this validates the session cookie
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "next-auth.session-token",
  });

  // Strict validation: token must exist AND have all required fields with valid values
  // This prevents access with partial, expired, or invalid tokens
  const hasValidToken =
    token !== null &&
    token !== undefined &&
    typeof token === "object" &&
    typeof token.userId === "string" &&
    token.userId.length > 0 &&
    typeof token.role === "string" &&
    token.role.length > 0;

  if (!hasValidToken) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);

    // Clear all possible session cookie variants to prevent stale cookies
    // This ensures clean state when switching between LAN and tunnel
    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("__Secure-next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");
    response.cookies.delete("__Host-next-auth.csrf-token");

    // Explicitly set cookies to expire to clear them
    const cookieOptions = {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    };

    // Clear session token
    response.cookies.set("next-auth.session-token", "", cookieOptions);
    response.cookies.set("__Secure-next-auth.session-token", "", cookieOptions);

    return response;
  }

  const response = NextResponse.next();

  // Add HSTS header for authenticated HTTPS connections
  if (protocol === "https") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth routes)
     * - api/setup (Setup routes)
     * - api/hospital-settings (Public hospital settings endpoint)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (login page)
     * - setup (setup page)
     * 
     * This includes root path "/" and all dashboard routes
     */
    "/((?!api/auth|api/setup|api/hospital-settings|_next/static|_next/image|favicon.ico|login|setup).*)",
    "/", // Explicitly include root path
  ],
};

