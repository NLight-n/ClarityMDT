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
      <div className="flex h-screen overflow-hidden">
        {/* Desktop Sidebar (Left Full-Height) */}
        <aside className="hidden md:block w-64 flex-shrink-0">
          <Sidebar userRole={userRole} />
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userName={userName} userRole={userRole} />
          <main className="flex-1 overflow-y-auto bg-neutral-50">
            {children}
          </main>

        </div>
      </div>
    </AlertProvider>
  );
}


