"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

export function MessageDialog({
  open,
  onOpenChange,
  type,
  title,
  message,
}: MessageDialogProps) {
  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-6 w-6 text-green-600" />;
      case "error":
        return <XCircle className="h-6 w-6 text-red-600" />;
      case "info":
        return <AlertCircle className="h-6 w-6 text-blue-600" />;
    }
  };

  const getButtonVariant = () => {
    switch (type) {
      case "success":
        return "default";
      case "error":
        return "destructive";
      case "info":
        return "default";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getIcon()}
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant={getButtonVariant()}
            onClick={() => onOpenChange(false)}
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

