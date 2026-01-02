"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
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

interface AlertContextType {
  alert: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
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

  const handleClose = useCallback(() => {
    setAlertState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleConfirm = useCallback(() => {
    alertState.onConfirm?.();
    handleClose();
  }, [alertState.onConfirm, handleClose]);

  const handleCancel = useCallback(() => {
    alertState.onCancel?.();
    handleClose();
  }, [alertState.onCancel, handleClose]);

  return (
    <AlertContext.Provider value={{ alert, confirm }}>
      {children}
      <CustomAlertDialog
        open={alertState.open}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        showCancel={alertState.showCancel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </AlertContext.Provider>
  );
}

export function useAlertContext() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlertContext must be used within AlertProvider");
  }
  return context;
}

