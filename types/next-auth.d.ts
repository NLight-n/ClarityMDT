import { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      loginId: string;
      role: Role;
      departmentId: string | null;
    };
  }

  interface User {
    id: string;
    name: string;
    loginId: string;
    role: Role;
    departmentId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: Role;
    departmentId: string | null;
    loginId: string;
    name: string;
  }
}

