"use client";

import { useState, useCallback } from "react";
import { CustomAlertDialog, AlertType } from "@/components/ui/custom-alert-dialog";

interface AlertOptions {
  type?: AlertType;
  title: string;
  message: string;
  confirmText?: string;
}

interface ConfirmOptions extends AlertOptions {
  onConfirm: () => void;
  onCancel?: () => void;
  cancelText?: string;
}

export function useAlert() {
  const [alertState, setAlertState] = useState<{
    open: boolean;
    type: AlertType;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    showCancel: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    open: false,
    type: "info",
    title: "",
    message: "",
    showCancel: false,
  });

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setAlertState({
        open: true,
        type: options.type || "info",
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || "OK",
        showCancel: false,
        onConfirm: () => {
          resolve();
        },
      });
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setAlertState({
        open: true,
        type: options.type || "warning",
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || "Confirm",
        cancelText: options.cancelText || "Cancel",
        showCancel: true,
        onConfirm: () => {
          options.onConfirm();
          resolve(true);
        },
        onCancel: () => {
          options.onCancel?.();
          resolve(false);
        },
      });
    });
  }, []);

  const close = useCallback(() => {
    setAlertState((prev) => ({ ...prev, open: false }));
  }, []);

  const AlertDialog = () => (
    <CustomAlertDialog
      open={alertState.open}
      onOpenChange={(open) => {
        if (!open) {
          setAlertState((prev) => ({ ...prev, open: false }));
        }
      }}
      type={alertState.type}
      title={alertState.title}
      message={alertState.message}
      confirmText={alertState.confirmText}
      cancelText={alertState.cancelText}
      showCancel={alertState.showCancel}
      onConfirm={alertState.onConfirm}
      onCancel={alertState.onCancel}
    />
  );

  return { alert, confirm, close, AlertDialog };
}

