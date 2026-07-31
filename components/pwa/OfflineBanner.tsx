"use client";

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    // Initial check
    setIsOffline(!navigator.onLine);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="bg-amber-600 text-white text-xs py-2 px-4 flex items-center justify-center gap-2 shadow-inner z-50 transition-all duration-300">
      <WifiOff className="h-3.5 w-3.5 animate-pulse flex-shrink-0" />
      <span className="font-medium">
        You are currently offline. Displaying cached clinical data and register entries.
      </span>
    </div>
  );
}
