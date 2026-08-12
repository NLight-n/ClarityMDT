"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink, Loader2, MonitorPlay } from "lucide-react";

interface OpenInWeasisButtonProps {
  attachmentId: string;
  variant?: "icon" | "button" | "cardAction";
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function OpenInWeasisButton({
  attachmentId,
  variant = "button",
  className = "",
  size,
}: OpenInWeasisButtonProps) {
  const [isDesktop, setIsDesktop] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Detect mobile vs desktop client
    if (typeof window !== "undefined") {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      setIsDesktop(!isMobileDevice);
    }
  }, []);

  const handleLaunchWeasis = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isDesktop) {
      setErrorMessage("Weasis is a native desktop application and cannot be opened on mobile devices. Please use the OHIF in-browser viewer instead.");
      setDialogOpen(true);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/weasis/launch/${attachmentId}`);
      const data = await response.json();

      if (!response.ok || !data.success || !data.launchUrl) {
        throw new Error(data.error || "Failed to generate Weasis launch link");
      }

      // Launch native application via custom protocol URL scheme
      window.location.href = data.launchUrl;

      // Show confirmation dialog with help text in case protocol handler fails or app isn't installed
      setDialogOpen(true);
    } catch (err: any) {
      console.error("Error launching Weasis:", err);
      setErrorMessage(err.message || "An unexpected error occurred while launching Weasis.");
      setDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (variant === "icon") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size={size || "icon"}
              onClick={handleLaunchWeasis}
              disabled={loading}
              className={`h-7 w-7 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 ${className}`}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isDesktop ? "Open in Weasis (Desktop App)" : "Weasis Desktop App (Desktop only)"}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (variant === "cardAction") {
      return (
        <Button
          size={size || "sm"}
          variant="outline"
          onClick={handleLaunchWeasis}
          disabled={loading}
          className={`border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-medium ${className}`}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          )}
          Open Weasis
        </Button>
      );
    }

    return (
      <Button
        variant="outline"
        size={size || "sm"}
        onClick={handleLaunchWeasis}
        disabled={loading}
        className={`border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-medium ${className}`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
        ) : (
          <ExternalLink className="h-4 w-4 mr-1.5" />
        )}
        Open in Weasis
      </Button>
    );
  };

  return (
    <>
      {renderContent()}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MonitorPlay className="h-5 w-5 text-blue-600" />
              {errorMessage ? "Weasis Launch Error" : "Opening in Weasis Application"}
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              {errorMessage ? (
                <span className="text-destructive font-medium">{errorMessage}</span>
              ) : (
                <span>
                  The study launch command was sent to the <strong>Weasis</strong> native application via browser protocol (<code className="text-xs bg-muted px-1 py-0.5 rounded">weasis://</code>).
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {!errorMessage && (
            <div className="space-y-3 py-2 text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border/50">
              <p className="font-semibold text-foreground">Did Weasis open?</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  If a browser prompt appeared asking permission to open <strong>Weasis</strong>, select <em>Open</em> or <em>Allow</em>.
                </li>
                <li>
                  If nothing happened, verify that the <strong>Weasis desktop application</strong> is installed on this workstation.
                </li>
                <li>
                  You can always fall back to using the <strong>Open in OHIF</strong> button to view DICOM studies directly inside your web browser.
                </li>
              </ul>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <a
              href="https://weasis.org/en/getting-started/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center"
            >
              Download Weasis Desktop Application
            </a>
            <Button variant="secondary" size="sm" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
