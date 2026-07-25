"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import Link from "next/link";
import { HospitalBranding } from "./HospitalBranding";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { useSession } from "next-auth/react";
import { PWAInstallButton } from "@/components/providers/PWAInstallButton";

interface TopbarProps {
  userName?: string;
  userRole?: "Admin" | "Coordinator" | "Consultant" | "Viewer" | null;
}

export function Topbar({ userName = "User", userRole }: TopbarProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const handleLogout = async () => {
    await signOut({ 
      redirect: false,
      callbackUrl: "/login"
    });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-white">

      {/* Mobile Layout */}
      <div className="md:hidden">
        {/* First line: Hospital branding in center */}
        <div className="flex items-center justify-center h-12 px-4 border-b">
          <HospitalBranding />
        </div>
        {/* Second line: ClarityMDT on left, User info + icon on right */}
        <div className="flex items-center justify-between h-12 px-4">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="ClarityMDT" className="h-6 w-6 rounded" />
            <h2 className="text-base font-semibold">ClarityMDT</h2>
          </div>
          
          {/* User info and icon */}
          <div className="flex items-center gap-1.5">
            <PWAInstallButton />
            <NotificationDropdown userId={session?.user?.id} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <User className="h-4 w-4" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {userRole || "Not logged in"}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings?tab=profile" className="flex items-center cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex h-16 items-center flex-1 px-6 relative">
        {/* Hospital Logo/Name in the center - absolutely positioned to viewport center */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <HospitalBranding />
        </div>


        {/* User info and menu on the right */}
        <div className="flex items-center gap-3 ml-auto">
          <PWAInstallButton />
          <NotificationDropdown userId={session?.user?.id} />
          <div className="text-right">
            <p className="text-sm font-medium leading-none">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {userRole || "Not logged in"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <User className="h-4 w-4" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{userName}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {userRole || "Not logged in"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings?tab=profile" className="flex items-center cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

