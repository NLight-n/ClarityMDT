"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2 } from "lucide-react";

interface DicomStorageItem {
  id: string;
  type: "zip" | "folder";
  fileName: string;
  fileSize: number;
  caseId: string;
  patientName: string;
  mrn: string | null;
  department: string;
  status: string;
}

interface DicomCaseGroup {
  caseId: string;
  patientName: string;
  mrn: string | null;
  department: string;
  status: string;
  totalSizeBytes: number;
}

interface PruneDicomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storageItems: DicomStorageItem[];
  onPruneComplete: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function PruneDicomDialog({
  open,
  onOpenChange,
  storageItems,
  onPruneComplete,
}: PruneDicomDialogProps) {
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [isPruning, setIsPruning] = useState(false);

  // Group individual items by caseId for bulk pruning
  const caseGroupsMap = new Map<string, DicomCaseGroup>();
  storageItems.forEach((item) => {
    if (!caseGroupsMap.has(item.caseId)) {
      caseGroupsMap.set(item.caseId, {
        caseId: item.caseId,
        patientName: item.patientName,
        mrn: item.mrn,
        department: item.department,
        status: item.status,
        totalSizeBytes: 0,
      });
    }
    const group = caseGroupsMap.get(item.caseId)!;
    group.totalSizeBytes += item.fileSize;
  });

  const archivedCases = Array.from(caseGroupsMap.values()).filter(
    (c) => c.status === "ARCHIVED"
  );

  const toggleCase = (caseId: string) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedCaseIds.size === archivedCases.length) {
      setSelectedCaseIds(new Set());
    } else {
      setSelectedCaseIds(new Set(archivedCases.map((c) => c.caseId)));
    }
  };

  const selectedTotalSize = archivedCases
    .filter((c) => selectedCaseIds.has(c.caseId))
    .reduce((sum, c) => sum + c.totalSizeBytes, 0);

  const handlePrune = async () => {
    if (selectedCaseIds.size === 0) return;
    setIsPruning(true);

    try {
      const response = await fetch("/api/admin/dicom-storage/prune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: Array.from(selectedCaseIds) }),
      });

      if (response.ok) {
        setSelectedCaseIds(new Set());
        onPruneComplete();
        onOpenChange(false);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to prune DICOM data");
      }
    } catch (error) {
      console.error("Error pruning DICOM data:", error);
      alert("An error occurred while pruning DICOM data");
    } finally {
      setIsPruning(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isPruning) {
      setSelectedCaseIds(new Set());
      onOpenChange(isOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Prune Archive DICOM Data</DialogTitle>
          <DialogDescription>
            Select archived cases to remove their DICOM data. Links, attachments
            and consensus reports will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded-md min-h-0">
          {archivedCases.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No archived cases with DICOM data found.
            </div>
          ) : (
            <div>
              {/* Select All header */}
              <div className="flex items-center gap-3 p-3 border-b bg-muted/50 sticky top-0 z-10">
                <Checkbox
                  checked={
                    archivedCases.length > 0 &&
                    selectedCaseIds.size === archivedCases.length
                  }
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm font-medium">
                  Select All ({archivedCases.length} cases)
                </span>
                {selectedCaseIds.size > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {selectedCaseIds.size} selected · {formatBytes(selectedTotalSize)}
                  </Badge>
                )}
              </div>

              {/* Case list sorted by size descending */}
              {archivedCases
                .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes)
                .map((c) => (
                  <div
                    key={c.caseId}
                    className="flex items-center gap-3 p-3 border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => toggleCase(c.caseId)}
                  >
                    <Checkbox
                      checked={selectedCaseIds.has(c.caseId)}
                      onCheckedChange={() => toggleCase(c.caseId)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {c.patientName}
                        </span>
                        {c.mrn && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                            {c.mrn}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.department}
                      </p>
                    </div>
                    <div className="text-sm font-mono text-muted-foreground flex-shrink-0">
                      {formatBytes(c.totalSizeBytes)}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isPruning}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handlePrune}
            disabled={isPruning || selectedCaseIds.size === 0}
          >
            {isPruning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pruning...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Prune {selectedCaseIds.size > 0 ? `(${selectedCaseIds.size})` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
