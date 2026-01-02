import type { NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { createAuditLog, AuditAction } from "@/lib/audit/logger";

export const authOptions: NextAuthConfig = {
  // trustHost allows NextAuth to dynamically detect the host from the incoming request
  // This enables the app to work with both:
  // - LAN access: http://<ip>:<port> (without internet)
  // - Cloudflare Tunnel: https://<tunnel-domain>
  // NextAuth will automatically infer the correct URL from request headers
  trustHost: true,
  
  // Use non-secure cookies for maximum compatibility with both HTTP (LAN) and HTTPS (tunnel)
  // Cookies with secure: false work on both protocols
  // NextAuth will handle URL generation correctly via trustHost regardless of protocol
  useSecureCookies: false,
  
  cookies: {
    sessionToken: {
      // Use standard cookie name (without __Secure- prefix) for compatibility
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false, // Works on both HTTP and HTTPS
        // Don't set domain - allows cookies to work on any domain (LAN IP or tunnel domain)
        // NextAuth will automatically scope cookies to the request origin
      },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false, // Works on both HTTP and HTTPS
        // Don't set domain - allows cookies to work on any domain
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        loginId: { label: "Login ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) {
          return null;
        }

        try {
          const loginId = credentials.loginId as string;
          const password = credentials.password as string;

          const user = await prisma.user.findUnique({
            where: {
              loginId: loginId,
            },
            include: {
              department: true,
            },
          });

          if (!user) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            password,
            user.passwordHash
          );

          if (!isPasswordValid) {
            return null;
          }

          // Create audit log for successful login
          await createAuditLog({
            action: AuditAction.LOGIN,
            userId: user.id,
            details: {
              loginId: user.loginId,
              role: user.role,
            },
            // Note: IP address is not available in authorize function
            // Login audit will still be created without IP
          }).catch((error) => {
            // Don't fail login if audit logging fails
            console.error("Error creating login audit log:", error);
          });

          return {
            id: user.id,
            name: user.name,
            loginId: user.loginId,
            role: user.role,
            departmentId: user.departmentId,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.departmentId = user.departmentId;
        token.loginId = user.loginId;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as Role;
        session.user.departmentId = token.departmentId as string | null;
        session.user.loginId = token.loginId as string;
      }
      return session;
    },
    // Ensure redirect URLs are correctly constructed from the request
    async redirect({ url, baseUrl }) {
      // With trustHost: true, baseUrl is automatically detected from the request
      // Always return relative URLs to avoid URL construction issues
      // This works for both LAN (http://ip:port) and tunnel (https://domain)
      if (url.startsWith("/")) {
        return url;
      }
      
      // Try to handle absolute URLs, but fallback to relative if baseUrl is invalid
      try {
        if (baseUrl && url) {
          const urlObj = new URL(url, baseUrl);
          // If same origin, return relative path
          if (urlObj.origin === baseUrl) {
            return urlObj.pathname + urlObj.search;
          }
        }
      } catch (error) {
        // If URL construction fails (e.g., invalid baseUrl), return relative path
        console.warn("Failed to construct redirect URL, using relative path:", error);
      }
      
      // Default to dashboard for any invalid or external URLs
      return "/dashboard";
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

