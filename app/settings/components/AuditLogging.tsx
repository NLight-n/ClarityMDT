"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { AuditAction } from "@/lib/audit/logger";

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
};

export function AuditLogging() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    action: "",
    userId: "",
    startDate: "",
    endDate: "",
  });

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

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const handleClearFilters = () => {
    setFilters({
      action: "",
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

  const formatDetails = (details: any) => {
    if (!details) return "-";
    try {
      const keys = Object.keys(details);
      if (keys.length === 0) return "-";
      return keys.map((key) => `${key}: ${JSON.stringify(details[key])}`).join(", ");
    } catch {
      return "-";
    }
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
              <label className="text-sm font-medium mb-2 block">User ID</label>
              <Input
                placeholder="Filter by user ID"
                value={filters.userId}
                onChange={(e) => handleFilterChange("userId", e.target.value)}
              />
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
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
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
                      <TableCell className="max-w-md">
                        <div className="text-xs text-muted-foreground truncate" title={formatDetails(log.details)}>
                          {formatDetails(log.details)}
                        </div>
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
    </Card>
  );
}
