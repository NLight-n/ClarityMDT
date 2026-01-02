"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertCircle, CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react";

export type AlertType = "error" | "success" | "warning" | "info" | "forbidden";

interface CustomAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: AlertType;
  title: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
}

const alertConfig = {
  error: {
    icon: XCircle,
    iconColor: "text-destructive",
    titleColor: "text-destructive",
  },
  success: {
    icon: CheckCircle2,
    iconColor: "text-green-600",
    titleColor: "text-green-600",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-yellow-600",
    titleColor: "text-yellow-600",
  },
  info: {
    icon: Info,
    iconColor: "text-blue-600",
    titleColor: "text-blue-600",
  },
  forbidden: {
    icon: AlertCircle,
    iconColor: "text-destructive",
    titleColor: "text-destructive",
  },
};

export function CustomAlertDialog({
  open,
  onOpenChange,
  type,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "OK",
  cancelText = "Cancel",
  showCancel = false,
}: CustomAlertDialogProps) {
  const config = alertConfig[type];
  const Icon = config.icon;

  const handleConfirm = () => {
    onConfirm?.();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 pb-2 border-b">
            <Icon className={`h-5 w-5 ${config.iconColor}`} />
            <AlertDialogTitle className={`${config.titleColor} text-base font-semibold`}>
              ClarityMDT
            </AlertDialogTitle>
          </div>
          <div className="pt-4">
            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <AlertDialogDescription className="text-sm">
              {message}
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {showCancel && (
            <AlertDialogCancel onClick={handleCancel}>
              {cancelText}
            </AlertDialogCancel>
          )}
          <AlertDialogAction onClick={handleConfirm}>
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

