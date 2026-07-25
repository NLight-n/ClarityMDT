"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWA } from "@/components/providers/PWARegister";

export function PWAInstallButton() {
  const { isInstallable, installApp } = usePWA();

  if (!isInstallable) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={installApp}
      className="flex items-center gap-1.5 text-xs font-medium border-primary/30 hover:bg-primary/10 text-primary"
    >
      <Download className="h-3.5 w-3.5" />
      <span>Install App</span>
    </Button>
  );
}
