"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useSession } from "next-auth/react";
import { AlertProvider } from "@/contexts/AlertContext";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Don't show sidebar/topbar on auth pages
  if (pathname?.startsWith("/login") || pathname?.startsWith("/setup")) {
    return (
      <AlertProvider>
        {children}
      </AlertProvider>
    );
  }

  const userRole = session?.user?.role || null;
  const userName = session?.user?.name || "User";

  return (
    <AlertProvider>
      <div className="flex h-screen flex-col">
        <Topbar userName={userName} userRole={userRole} />
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop Sidebar */}
          <aside className="hidden md:block w-64 flex-shrink-0">
            <Sidebar userRole={userRole} />
          </aside>
          {/* Main Content */}
          <main className="flex-1 overflow-y-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </AlertProvider>
  );
}

