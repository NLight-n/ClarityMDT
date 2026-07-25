"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navigation } from "./Sidebar";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            pathname?.startsWith(item.href + "/");

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full px-1 py-1 rounded-lg transition-colors duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-7 rounded-full transition-all duration-300",
                  isActive
                    ? "bg-primary/10 scale-110"
                    : ""
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    isActive ? "stroke-[2.5px]" : "stroke-[1.5px]"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] leading-tight transition-all duration-200",
                  isActive ? "font-semibold" : "font-medium"
                )}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
