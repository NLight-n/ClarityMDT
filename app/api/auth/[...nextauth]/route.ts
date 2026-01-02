import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

const { handlers } = NextAuth(authOptions);

export const { GET, POST } = handlers;

