"use client";

import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: BottomSheetProps) {
  // Prevent body bounce / overscroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "fixed inset-x-0 bottom-0 top-auto z-50 m-0 max-h-[85vh] w-full max-w-full rounded-t-3xl border-t bg-background p-0 shadow-2xl transition-transform duration-300 ease-out data-[state=closed]:translate-y-full data-[state=open]:translate-y-0 safe-area-bottom",
          className
        )}
      >
        {/* Touch drag handle bar */}
        <div className="flex w-full items-center justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        {title && (
          <div className="px-6 pb-2 pt-1 border-b">
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          </div>
        )}

        <div className="overflow-y-auto p-6 max-h-[calc(85vh-60px)]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
