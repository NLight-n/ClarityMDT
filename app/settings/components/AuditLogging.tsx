"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, Filter, X, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { AuditAction } from "@/lib/audit/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userName: string;
  userLoginId: string;
  userRole: string;
  caseId: string | null;
  casePatientName: string | null;
  caseMrn: string | null;
  targetUserId: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface User {
  id: string;
  name: string;
  loginId: string;
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Login",
  CASE_SUBMIT: "Case Submit",
  CASE_UPDATE: "Case Update",
  CASE_DELETE: "Case Delete",
  CONSENSUS_CREATE: "Consensus Create",
  CONSENSUS_EDIT: "Consensus Edit",
  COORDINATOR_ASSIGN: "Coordinator Assign",
  COORDINATOR_REVOKE: "Coordinator Revoke",
  USER_CREATE: "User Create",
  USER_UPDATE: "User Update",
  USER_DELETE: "User Delete",
  DEPARTMENT_CREATE: "Department Create",
  DEPARTMENT_UPDATE: "Department Update",
  DEPARTMENT_DELETE: "Department Delete",
  HOSPITAL_SETTINGS_UPDATE: "Hospital Settings Update",
  ATTACHMENT_UPLOAD: "Attachment Upload",
  ATTACHMENT_DELETE: "Attachment Delete",
  DICOM_UPLOAD: "DICOM Upload",
  DICOM_DELETE: "DICOM Delete",
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-blue-500",
  CASE_SUBMIT: "bg-green-500",
  CASE_UPDATE: "bg-blue-500",
  CASE_DELETE: "bg-red-500",
  CONSENSUS_CREATE: "bg-purple-500",
  CONSENSUS_EDIT: "bg-purple-500",
  COORDINATOR_ASSIGN: "bg-yellow-500",
  COORDINATOR_REVOKE: "bg-orange-500",
  USER_CREATE: "bg-green-500",
  USER_UPDATE: "bg-blue-500",
  USER_DELETE: "bg-red-500",
  DEPARTMENT_CREATE: "bg-green-500",
  DEPARTMENT_UPDATE: "bg-blue-500",
  DEPARTMENT_DELETE: "bg-red-500",
  HOSPITAL_SETTINGS_UPDATE: "bg-indigo-500",
  ATTACHMENT_UPLOAD: "bg-teal-500",
  ATTACHMENT_DELETE: "bg-pink-500",
  DICOM_UPLOAD: "bg-cyan-500",
  DICOM_DELETE: "bg-rose-500",
};

export function AuditLogging() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    action: "LOGIN",
    userId: "",
    startDate: "",
    endDate: "",
  });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await fetch("/api/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
      });

      if (filters.action) params.append("action", filters.action);
      if (filters.userId) params.append("userId", filters.userId);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);

      const response = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }

      const data: AuditLogsResponse = await response.json();
      setLogs(data.logs);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const handleClearFilters = () => {
    setFilters({
      action: "LOGIN",
      userId: "",
      startDate: "",
      endDate: "",
    });
    setPage(1);
  };

  const getActionLabel = (action: string) => {
    return ACTION_LABELS[action] || action;
  };

  const getActionColor = (action: string) => {
    return ACTION_COLORS[action] || "bg-gray-500";
  };

  const formatRichText = (node: any): string => {
    if (!node) return "";
    if (typeof node === "string") return node;
    
    // Handle text nodes
    if (node.type === "text") {
      return node.text || "";
    }

    // Handle nodes with content
    if (Array.isArray(node.content)) {
      const text = node.content.map(formatRichText).join("");
      
      // Add formatting for block elements
      if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") {
        return text + "\n";
      }
      return text;
    }

    return "";
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    
    if (typeof value === "object") {
      // Check if it's a ProseMirror/Tiptap document
      if (value.type === "doc" && Array.isArray(value.content)) {
        return formatRichText(value).trim();
      }

      // Check if it's an array of links
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
        const first = value[0];
        if ("url" in first && "label" in first) {
          return value.map((l: any) => `${l.label}: ${l.url}`).join("\n");
        }
      }

      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return "[Complex Data]";
      }
    }
    return String(value);
  };

  const handleRowClick = (log: AuditLog) => {
    setSelectedLog(log);
    setIsDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Logging</CardTitle>
        <CardDescription>
          View system audit logs and activity history. All CRUD operations are logged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Action</label>
              <Select
                value={filters.action || "all"}
                onValueChange={(value) => handleFilterChange("action", value === "all" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {Object.entries(ACTION_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">User</label>
              <Select
                value={filters.userId || "all"}
                onValueChange={(value) => handleFilterChange("userId", value === "all" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.loginId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange("startDate", e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange("endDate", e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleApplyFilters} size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Apply Filters
            </Button>
            <Button onClick={handleClearFilters} variant="outline" size="sm">
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No audit logs found.</p>
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow 
                      key={log.id} 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleRowClick(log)}
                    >
                      <TableCell className="font-mono text-xs">
                        {format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge className={getActionColor(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{log.userName}</div>
                          <div className="text-xs text-muted-foreground">
                            {log.userLoginId} ({log.userRole})
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.targetUserId ? (
                          <div className="text-xs font-mono">{log.targetUserId}</div>
                        ) : log.caseId ? (
                          <div>
                            {log.casePatientName ? (
                              <div>
                                <div className="font-medium">{log.casePatientName}</div>
                                {log.caseMrn && (
                                  <div className="text-xs text-muted-foreground">MRN: {log.caseMrn}</div>
                                )}
                                <div className="text-xs text-muted-foreground font-mono mt-1">ID: {log.caseId}</div>
                              </div>
                            ) : (
                              <div className="text-xs font-mono">Case: {log.caseId}</div>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.ipAddress || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, total)} of {total} logs
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    Page {page} of {totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Detailed view of the audit entry.
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <ScrollArea className="h-[65vh] pr-4">
              <div className="space-y-6 py-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground font-medium">Activity</p>
                    <div className="flex items-center gap-2">
                       <Badge className={getActionColor(selectedLog.action)}>
                        {getActionLabel(selectedLog.action)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(selectedLog.createdAt), "PPP p")}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-muted-foreground font-medium">Performed By</p>
                    <p>{selectedLog.userName} ({selectedLog.userLoginId})</p>
                    <p className="text-xs text-muted-foreground">{selectedLog.userRole}</p>
                  </div>
                </div>

                {/* Patient / Target Info */}
                {(selectedLog.caseId || selectedLog.targetUserId) && (
                  <div className="p-3 bg-muted/30 rounded-lg border text-sm">
                    <p className="text-muted-foreground font-medium mb-2">Target Information</p>
                    {selectedLog.caseId ? (
                      <div className="grid grid-cols-2 gap-2">
                         <div>
                          <p className="text-xs text-muted-foreground">Patient</p>
                          <p className="font-medium">{selectedLog.casePatientName || "Unknown"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">MRN</p>
                          <p>{selectedLog.caseMrn || "-"}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Case ID</p>
                          <p className="font-mono text-xs">{selectedLog.caseId}</p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-muted-foreground">Target User ID</p>
                        <p className="font-mono text-xs">{selectedLog.targetUserId}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Comparison Table for Updates */}
                {selectedLog.details?.changes && Object.keys(selectedLog.details.changes).length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Changes Comparison
                    </p>
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead className="w-[150px]">Field</TableHead>
                            <TableHead>Previous Value</TableHead>
                            <TableHead>New Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(selectedLog.details.changes).map(([key, change]: [string, any]) => (
                            <TableRow key={key}>
                              <TableCell className="font-medium align-top py-4">
                                {key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                              </TableCell>
                              <TableCell className="text-muted-foreground bg-red-50/20 whitespace-pre-wrap py-4 font-mono text-xs max-w-[300px]">
                                {formatValue(change.old)}
                              </TableCell>
                              <TableCell className="bg-green-50/20 whitespace-pre-wrap py-4 font-mono text-xs max-w-[300px]">
                                {formatValue(change.new)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : selectedLog.details ? (
                  /* Standard Details for non-update actions */
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Activity Details</p>
                    <div className="p-4 bg-muted/20 rounded-md border text-sm font-mono whitespace-pre-wrap">
                      {formatValue(selectedLog.details)}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No additional details for this entry.
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
