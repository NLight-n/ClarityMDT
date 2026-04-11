"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  HardDrive,
  Trash2,
  Search,
  ArchiveRestore,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
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
import { PruneDicomDialog } from "./PruneDicomDialog";

interface DicomStorageItem {
  id: string;
  type: "zip" | "folder";
  fileName: string;
  fileSize: number;
  storageKey: string;
  caseId: string;
  patientName: string;
  mrn: string | null;
  department: string;
  status: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getStatusColor(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    case "SUBMITTED":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    case "PENDING":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    case "REVIEWED":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case "RESUBMITTED":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
    case "ARCHIVED":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    default:
      return "";
  }
}

export function StorageManagement() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [storageItems, setStorageItems] = useState<DicomStorageItem[]>([]);
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);
  const [isCleaningMpr, setIsCleaningMpr] = useState(false);
  const [isOrphanDialogOpen, setIsOrphanDialogOpen] = useState(false);
  const [isMprCleanupDialogOpen, setIsMprCleanupDialogOpen] = useState(false);
  const [isPruneDialogOpen, setIsPruneDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    item: DicomStorageItem | null;
  }>({ open: false, item: null });
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

  const canManage = user && isCoordinator(user);

  useEffect(() => {
    if (canManage) {
      loadStorageData();
    }
  }, [canManage]);

  const loadStorageData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/dicom-storage");
      if (response.ok) {
        const data = await response.json();
        setStorageItems(data);
      }
    } catch (error) {
      console.error("Error loading storage data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanOrphans = async () => {
    setIsCleaningOrphans(true);
    try {
      const response = await fetch("/api/admin/dicom-storage/orphans", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setMessageDialog({
          open: true,
          type: "success",
          title: "Orphan Cleanup Complete",
          message: `Cleaned ${data.deletedCount} orphaned file(s), freeing ${formatBytes(data.deletedBytes)}.`,
        });
      } else {
        const errorData = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Cleanup Failed",
          message: errorData.error || "Failed to clean orphaned files",
        });
      }
    } catch (error) {
      console.error("Error cleaning orphans:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred during orphan cleanup",
      });
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  const handleCleanExpiredMpr = async () => {
    setIsCleaningMpr(true);
    setIsMprCleanupDialogOpen(false);
    try {
      const response = await fetch("/api/mpr/cleanup", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setMessageDialog({
          open: true,
          type: "success",
          title: "MPR Cleanup Complete",
          message: `Deleted ${data.expiredJobsDeleted} expired MPR job(s) and ${data.failedJobsDeleted} failed job(s).${data.errors > 0 ? ` ${data.errors} error(s) encountered.` : ""}`,
        });
      } else {
        const errorData = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "MPR Cleanup Failed",
          message: errorData.error || "Failed to clean expired MPR files",
        });
      }
    } catch (error) {
      console.error("Error cleaning expired MPR files:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred during MPR cleanup",
      });
    } finally {
      setIsCleaningMpr(false);
    }
  };

  const handleDeleteDicomItem = async () => {
    if (!deleteDialog.item) return;

    try {
      const response = await fetch("/api/admin/dicom-storage/delete-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: deleteDialog.item.id,
          type: deleteDialog.item.type 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setStorageItems((prev) =>
          prev.filter((i) => i.id !== deleteDialog.item!.id)
        );
        setMessageDialog({
          open: true,
          type: "success",
          title: "DICOM Deleted",
          message: `Deleted "${deleteDialog.item.fileName}", freeing ${formatBytes(data.bytesFreed)}.`,
        });
      } else {
        const errorData = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: errorData.error || "Failed to delete DICOM data",
        });
      }
    } catch (error) {
      console.error("Error deleting DICOM data:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred while deleting DICOM data",
      });
    } finally {
      setDeleteDialog({ open: false, item: null });
    }
  };

  const totalStorageUsed = storageItems.reduce((sum, item) => sum + item.fileSize, 0);
  const uniqueCaseCount = new Set(storageItems.map(item => item.caseId)).size;

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
            Only administrators and coordinators can manage DICOM storage.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                DICOM Storage Management
              </CardTitle>
              <CardDescription>
                Monitor and manage DICOM data across all cases.{" "}
                <span className="font-semibold">
                  Total: {formatBytes(totalStorageUsed)}
                </span>{" "}
                across {storageItems.length} uploads for {uniqueCaseCount} case(s).
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadStorageData}
                disabled={isCleaningOrphans}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOrphanDialogOpen(true)}
                disabled={isCleaningOrphans}
              >
                {isCleaningOrphans ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Clean Orphaned Files
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMprCleanupDialogOpen(true)}
                disabled={isCleaningMpr}
              >
                {isCleaningMpr ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cleaning...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Clean Expired MPR Files
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsPruneDialogOpen(true)}
                disabled={storageItems.filter((i) => i.status === "ARCHIVED").length === 0}
              >
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Prune Archive Data
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {storageItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No DICOM data found.</p>
              <p className="text-sm mt-2">
                Upload DICOM folders to cases to see storage usage here.
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>MRN</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>DICOM Name</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storageItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.patientName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.mrn || "—"}
                      </TableCell>
                      <TableCell>{item.department}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStatusColor(item.status)}`}
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={item.fileName}>
                        {item.fileName}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                        {formatBytes(item.fileSize)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteDialog({ open: true, item: item })
                          }
                          title="Delete this DICOM upload"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orphan Cleanup Confirmation Dialog */}
      <AlertDialog
        open={isOrphanDialogOpen}
        onOpenChange={(open) => setIsOrphanDialogOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clean Orphaned DICOM Files</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to scan and delete all orphaned DICOM files?
              This will remove all raw data in storage that is not linked to any
              active case in the database.
              <br />
              <br />
              <span className="font-bold text-destructive">
                This action is irreversible.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaningOrphans}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCleanOrphans}
              disabled={isCleaningOrphans}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Start Cleanup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete DICOM Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, item: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DICOM Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the DICOM upload{" "}
              <strong>&quot;{deleteDialog.item?.fileName}&quot;</strong> for{" "}
              <strong>{deleteDialog.item?.patientName}</strong>?
              <br />
              <br />
              This will remove {formatBytes(deleteDialog.item?.fileSize || 0)} of
              DICOM data from storage.
              <br />
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDicomItem}
              className="bg-destructive text-destructive-foreground"
            >
              Delete DICOM
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MPR Cleanup Confirmation Dialog */}
      <AlertDialog
        open={isMprCleanupDialogOpen}
        onOpenChange={(open) => setIsMprCleanupDialogOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clean Expired MPR Files</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all expired server-side MPR reconstructions and
              their derived DICOM files from storage.
              <br />
              <br />
              Expired MPR jobs are those older than the configured retention
              period (default: 7 days). Failed MPR jobs older than 24 hours
              will also be removed.
              <br />
              <br />
              Original DICOM data is <strong>never</strong> affected. Users
              can re-generate MPR if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaningMpr}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCleanExpiredMpr}
              disabled={isCleaningMpr}
            >
              Clean Expired MPR
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prune Archive Dialog */}
      <PruneDicomDialog
        open={isPruneDialogOpen}
        onOpenChange={setIsPruneDialogOpen}
        storageItems={storageItems}
        onPruneComplete={loadStorageData}
      />

      {/* Status Message Dialog */}
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
