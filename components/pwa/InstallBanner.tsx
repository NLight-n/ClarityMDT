"use client";

import { useState, useEffect } from "react";
import { usePWA } from "@/components/providers/PWARegister";
import { Button } from "@/components/ui/button";
import { Download, Share, PlusSquare, X } from "lucide-react";

export function InstallBanner() {
  const { isInstallable, installApp } = usePWA();
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Check if user previously dismissed prompt
    const isDismissed = localStorage.getItem("claritymdt_install_dismissed") === "true";
    if (isDismissed) {
      setDismissed(true);
      return;
    }

    setDismissed(false);

    // Detect iOS Safari standalone state
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;

    if (isIOS && !isStandalone) {
      setShowIOSPrompt(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("claritymdt_install_dismissed", "true");
  };

  if (dismissed) return null;
  if (!isInstallable && !showIOSPrompt) return null;

  return (
    <div className="fixed bottom-16 left-3 right-3 md:bottom-4 md:left-auto md:right-4 md:max-w-md z-40 p-4 rounded-2xl bg-neutral-900 text-white shadow-2xl border border-neutral-800 backdrop-blur-lg animate-in slide-in-from-bottom-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="ClarityMDT" className="h-10 w-10 rounded-xl flex-shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-white">Install ClarityMDT App</h4>
            <p className="text-xs text-neutral-400 mt-0.5">
              Add to your home screen for fast offline access and native push notifications.
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center justify-between gap-2">
        {isInstallable ? (
          <Button
            size="sm"
            onClick={installApp}
            className="w-full bg-white text-black hover:bg-neutral-200 font-semibold text-xs h-9 gap-1.5"
          >
            <Download className="h-4 w-4" />
            <span>Install Standalone App</span>
          </Button>
        ) : showIOSPrompt ? (
          <div className="text-xs text-neutral-300 flex items-center gap-1.5 leading-tight">
            <span>Tap</span>
            <Share className="h-4 w-4 text-blue-400 inline mx-0.5" />
            <span>then select</span>
            <span className="font-semibold text-white">"Add to Home Screen"</span>
            <PlusSquare className="h-4 w-4 text-white inline mx-0.5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
