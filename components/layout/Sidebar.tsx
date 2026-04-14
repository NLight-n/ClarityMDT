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

  const sidebarLogo = (
    <div className="px-6 py-8 border-b border-neutral-900">
      <Link href="/dashboard" className="flex items-center gap-2">
        <img
          src="/icon.svg"
          alt="ClarityMDT Logo"
          className="h-8 w-8 rounded-lg"
        />
        <span className="text-xl font-bold tracking-tight text-white">ClarityMDT</span>
      </Link>
    </div>
  );

  const sidebarContent = (
    <nav className="space-y-1 px-3 py-4">
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-white text-black shadow-lg shadow-black/10 scale-[1.02]"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            )}
          >
            <Icon className={cn("h-4.5 w-4.5", isActive ? "text-black" : "text-neutral-400")} />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarFooter = (
    <div className="border-t border-neutral-900 px-4 py-3 text-[11px] leading-relaxed text-neutral-500">
      <p>Built to improve collaboration and efficiency in multidisciplinary team meetings.</p>
      <p className="mt-1"><span className="font-semibold text-neutral-300">ClarityMDT</span> &copy; 2026 All rights reserved.</p>
    </div>
  );

  // For Register page, show calendar and upcoming meetings below navigation
  if (isRegisterPage) {
    return (
      <div className={cn("flex h-full w-64 flex-col border-r border-neutral-900 bg-neutral-950 overflow-hidden", className)}>
        {sidebarLogo}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-neutral-800">
          {sidebarContent}
          <div className="px-1 pb-8 dark">
             <CalendarSidebar />
          </div>
        </div>
      </div>
    );
  }

  // For other pages, show normal sidebar
  return (
    <div className={cn("flex h-full w-64 flex-col border-r border-neutral-900 bg-neutral-950", className)}>
      {sidebarLogo}
      <div className="flex-1 overflow-y-auto">
        {sidebarContent}
      </div>
      {sidebarFooter}
    </div>
  );
}




