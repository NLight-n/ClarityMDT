import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Force dynamic rendering - this page checks database state and redirects
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Check if setup is required
  const userCount = await prisma.user.count();
  
  if (userCount === 0) {
    redirect("/setup");
  }
  
  // Always redirect to dashboard - let middleware handle authentication
  // This ensures consistent behavior and proper cookie validation
  redirect("/dashboard");
}

