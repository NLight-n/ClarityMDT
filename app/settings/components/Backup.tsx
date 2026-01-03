"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database, HardDrive, Download, Trash2, Plus, RotateCcw, Upload } from "lucide-react";
import { useSession } from "next-auth/react";
import { isAdmin } from "@/lib/permissions/client";
import { formatDistanceToNow } from "date-fns";
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
import { MessageDialog } from "@/components/ui/message-dialog";

interface Backup {
  id: string;
  type: "database" | "minio";
  fileName: string;
  fileSize: string;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    loginId: string;
  };
}

export function Backup() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState<string | null>(null);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    backup: Backup | null;
  }>({
    open: false,
    backup: null,
  });
  const [restoreDialog, setRestoreDialog] = useState<{
    open: boolean;
    type: "database" | "minio" | null;
    backup: Backup | null;
  }>({
    open: false,
    type: null,
    backup: null,
  });
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [messageDialog, setMessageDialog] = useState<{
    open: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({
    open: false,
    type: "success",
    title: "",
    message: "",
  });

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const canManage = user && isAdmin(user);

  useEffect(() => {
    if (canManage) {
      loadBackups();
    }
  }, [canManage]);

  const loadBackups = async () => {
    try {
      const response = await fetch("/api/backups");
      if (response.ok) {
        const data = await response.json();
        setBackups(data);
      }
    } catch (error) {
      console.error("Error loading backups:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async (type: "database" | "minio") => {
    setCreatingBackup(type);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        const newBackup = await response.json();
        setBackups([newBackup, ...backups]);
        setMessageDialog({
          open: true,
          type: "success",
          title: "Backup Created",
          message: `${type === "database" ? "Database" : "MinIO"} backup created successfully.`,
        });
      } else {
        const errorData = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: errorData.error || "Failed to create backup",
        });
      }
    } catch (error: any) {
      console.error("Error creating backup:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: error.message || "An error occurred while creating the backup",
      });
    } finally {
      setCreatingBackup(null);
    }
  };

  const handleDownload = async (backup: Backup) => {
    try {
      const response = await fetch(`/api/backups/${backup.id}`);
      if (response.ok) {
        const data = await response.json();
        // Open download URL in new tab
        window.open(data.url, "_blank");
      } else {
        const errorData = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: errorData.error || "Failed to generate download URL",
        });
      }
    } catch (error) {
      console.error("Error downloading backup:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred while downloading the backup",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.backup) return;

    try {
      const response = await fetch(`/api/backups/${deleteDialog.backup.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setBackups(backups.filter((b) => b.id !== deleteDialog.backup!.id));
        setMessageDialog({
          open: true,
          type: "success",
          title: "Backup Deleted",
          message: "Backup deleted successfully",
        });
      } else {
        const errorData = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: errorData.error || "Failed to delete backup",
        });
      }
    } catch (error) {
      console.error("Error deleting backup:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred while deleting the backup",
      });
    } finally {
      setDeleteDialog({ open: false, backup: null });
    }
  };

  const handleRestore = async () => {
    if (!restoreDialog.type) return;

    setRestoringBackup(restoreDialog.backup?.id || "upload");
    try {
      const formData = new FormData();
      formData.append("type", restoreDialog.type);

      if (restoreDialog.backup) {
        // Restore from existing backup
        formData.append("backupId", restoreDialog.backup.id);
      } else if (restoreFile) {
        // Restore from uploaded file
        formData.append("file", restoreFile);
      } else {
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: "Please select a backup file or choose an existing backup",
        });
        setRestoringBackup(null);
        return;
      }

      const response = await fetch("/api/backups/restore", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        setMessageDialog({
          open: true,
          type: "success",
          title: "Restore Successful",
          message: `${restoreDialog.type === "database" ? "Database" : "MinIO"} restored successfully.`,
        });
        setRestoreDialog({ open: false, type: null, backup: null });
        setRestoreFile(null);
      } else {
        const errorData = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Restore Failed",
          message: errorData.error || "Failed to restore backup",
        });
      }
    } catch (error: any) {
      console.error("Error restoring backup:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: error.message || "An error occurred while restoring the backup",
      });
    } finally {
      setRestoringBackup(null);
    }
  };

  const formatFileSize = (bytes: string): string => {
    const size = BigInt(bytes);
    const kb = BigInt(1024);
    const mb = BigInt(1024 * 1024);
    const gb = BigInt(1024 * 1024 * 1024);
    if (size < kb) return `${size} B`;
    if (size < mb) return `${Number(size) / 1024} KB`;
    if (size < gb) return `${Number(size) / (1024 * 1024)} MB`;
    return `${Number(size) / (1024 * 1024 * 1024)} GB`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Only administrators can manage backups.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Backup Management</CardTitle>
              <CardDescription>
                Create and manage database and MinIO backups
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => handleCreateBackup("database")}
                disabled={creatingBackup !== null || restoringBackup !== null}
                variant="outline"
              >
                {creatingBackup === "database" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Backup Database
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleCreateBackup("minio")}
                disabled={creatingBackup !== null || restoringBackup !== null}
                variant="outline"
              >
                {creatingBackup === "minio" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <HardDrive className="mr-2 h-4 w-4" />
                    Backup MinIO
                  </>
                )}
              </Button>
              <div className="relative flex items-center w-full lg:w-auto">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase w-full lg:w-auto">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              <Button
                onClick={() => setRestoreDialog({ open: true, type: "database", backup: null })}
                disabled={creatingBackup !== null || restoringBackup !== null}
                variant="outline"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore Database
              </Button>
              <Button
                onClick={() => setRestoreDialog({ open: true, type: "minio", backup: null })}
                disabled={creatingBackup !== null || restoringBackup !== null}
                variant="outline"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore MinIO
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No backups found.</p>
              <p className="text-sm mt-2">Create a backup to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup) => (
                  <TableRow key={backup.id}>
                    <TableCell>
                      <Badge variant={backup.type === "database" ? "default" : "secondary"}>
                        {backup.type === "database" ? (
                          <>
                            <Database className="mr-1 h-3 w-3" />
                            Database
                          </>
                        ) : (
                          <>
                            <HardDrive className="mr-1 h-3 w-3" />
                            MinIO
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{backup.fileName}</TableCell>
                    <TableCell>{formatFileSize(backup.fileSize)}</TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(backup.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>{backup.createdBy.name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(backup)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRestoreDialog({ open: true, type: backup.type, backup })}
                          title="Restore"
                        >
                          <RotateCcw className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteDialog({ open: true, backup })}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, backup: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this backup? This action cannot be undone.
              <br />
              <br />
              <strong>{deleteDialog.backup?.fileName}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={restoreDialog.open}
        onOpenChange={(open) => {
          setRestoreDialog({ open, type: null, backup: null });
          setRestoreFile(null);
        }}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore {restoreDialog.type === "database" ? "Database" : "MinIO"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Option 1: Restore from existing backup</p>
                <p className="text-sm text-muted-foreground">
                  Select a backup from the list below to restore:
                </p>
                <div className="max-h-48 overflow-y-auto border rounded-md">
                  {backups
                    .filter((b) => b.type === restoreDialog.type)
                    .map((backup) => (
                      <div
                        key={backup.id}
                        className={`p-2 border-b cursor-pointer hover:bg-muted ${
                          restoreDialog.backup?.id === backup.id ? "bg-muted" : ""
                        }`}
                        onClick={() => setRestoreDialog({ ...restoreDialog, backup })}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{backup.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(backup.fileSize)} • {formatDistanceToNow(new Date(backup.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          {restoreDialog.backup?.id === backup.id && (
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>
                    ))}
                  {backups.filter((b) => b.type === restoreDialog.type).length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No {restoreDialog.type} backups available
                    </div>
                  )}
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-foreground">Option 2: Upload backup file</p>
                <p className="text-sm text-muted-foreground">
                  Upload a {restoreDialog.type === "database" ? "SQL" : "tar.gz"} backup file:
                </p>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="restore-file-upload"
                    className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                  </label>
                  <input
                    id="restore-file-upload"
                    type="file"
                    accept={restoreDialog.type === "database" ? ".sql" : ".tar.gz,.tgz"}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setRestoreFile(file);
                        setRestoreDialog({ ...restoreDialog, backup: null });
                      }
                    }}
                    className="hidden"
                  />
                  {restoreFile && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{restoreFile.name}</span>
                      <span className="text-muted-foreground">
                        ({(restoreFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm font-semibold text-amber-800">⚠️ Warning</p>
                <p className="text-xs text-amber-700 mt-1">
                  Restoring will replace all existing {restoreDialog.type === "database" ? "database" : "MinIO"} data with the backup data. This action cannot be undone. Make sure you have a current backup before proceeding.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setRestoreFile(null);
                setRestoreDialog({ open: false, type: null, backup: null });
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={!restoreDialog.backup && !restoreFile}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {restoringBackup ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MessageDialog
        open={messageDialog.open}
        onOpenChange={(open) => setMessageDialog({ ...messageDialog, open })}
        type={messageDialog.type}
        title={messageDialog.title}
        message={messageDialog.message}
      />
    </>
  );
}
