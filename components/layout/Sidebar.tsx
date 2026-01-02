"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  Settings,
  ClipboardList,
} from "lucide-react";
import dynamic from "next/dynamic";

// Dynamically import CalendarSidebar to avoid issues with Register page imports
const CalendarSidebar = dynamic(
  () => import("@/app/register/components/CalendarSidebar").then((mod) => ({ default: mod.CalendarSidebar })),
  { ssr: false }
);

interface SidebarProps {
  userRole?: "Admin" | "Coordinator" | "Consultant" | "Viewer" | null;
  className?: string;
}

export const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Register",
    href: "/register",
    icon: ClipboardList,
  },
  {
    name: "Cases",
    href: "/cases",
    icon: FileText,
  },
  {
    name: "Meetings",
    href: "/meetings",
    icon: Calendar,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar({ userRole, className }: SidebarProps) {
  const pathname = usePathname();
  const isRegisterPage = pathname === "/register" || pathname?.startsWith("/register/");

  // For Register page, show calendar and upcoming meetings below navigation
  if (isRegisterPage) {
    return (
      <div className={cn("flex h-full w-64 flex-col border-r bg-card overflow-hidden", className)}>
        <nav className="flex-shrink-0 space-y-1 px-3 py-4 border-b">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <CalendarSidebar />
        </div>
      </div>
    );
  }

  // For other pages, show normal sidebar
  return (
    <div className={cn("flex h-full w-64 flex-col border-r bg-card", className)}>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

