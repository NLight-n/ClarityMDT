"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CheckCheck, Trash2, Loader2, Send, MessageSquare, Trash } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  readAt?: string | null;
  meetingId?: string | null;
  caseId?: string | null;
  meeting?: {
    id: string;
    date: string;
    description?: string | null;
  } | null;
  case?: {
    id: string;
    patientName: string;
    mrn?: string | null;
  } | null;
}

interface Department {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  name: string;
  department?: {
    name: string;
  } | null;
}

export function NotificationSettings() {
  const { data: session } = useSession();
  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const isUserCoordinator = user && isCoordinator(user);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  // Manual notification form state
  const [manualNotificationOpen, setManualNotificationOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [recipientType, setRecipientType] = useState<"everyone" | "department" | "individual">("everyone");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [sendingManual, setSendingManual] = useState(false);

  // Meeting request form state
  const [meetingRequestOpen, setMeetingRequestOpen] = useState(false);
  const [meetingRemarks, setMeetingRemarks] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  // Bulk delete state
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Message dialog state
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

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=100&unreadOnly=false");
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Fetch departments and users for manual notification form
  useEffect(() => {
    if (isUserCoordinator && manualNotificationOpen) {
      const fetchData = async () => {
        try {
          const [deptResponse, usersResponse] = await Promise.all([
            fetch("/api/departments"),
            fetch("/api/notifications/users"),
          ]);

          if (deptResponse.ok) {
            const deptData = await deptResponse.json();
            setDepartments(deptData);
          }

          if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            setUsers(usersData);
          }
        } catch (error) {
          console.error("Error fetching departments/users:", error);
        }
      };

      fetchData();
    }
  }, [isUserCoordinator, manualNotificationOpen]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        const deleted = notifications.find((n) => n.id === notificationId);
        if (deleted && !deleted.read) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        // Remove from selected if it was selected
        setSelectedNotifications((prev) => {
          const newSet = new Set(prev);
          newSet.delete(notificationId);
          return newSet;
        });
      }
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const handleToggleSelect = (notificationId: string) => {
    setSelectedNotifications((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(notificationId)) {
        newSet.delete(notificationId);
      } else {
        newSet.add(notificationId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedNotifications.size === notifications.length) {
      setSelectedNotifications(new Set());
    } else {
      setSelectedNotifications(new Set(notifications.map((n) => n.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedNotifications.size === 0) return;

    setDeletingBulk(true);
    try {
      const response = await fetch("/api/notifications/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationIds: Array.from(selectedNotifications),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications((prev) =>
          prev.filter((n) => !selectedNotifications.has(n.id))
        );
        // Update unread count
        const deletedUnread = notifications.filter(
          (n) => selectedNotifications.has(n.id) && !n.read
        ).length;
        setUnreadCount((prev) => Math.max(0, prev - deletedUnread));
        setSelectedNotifications(new Set());
        setMessageDialog({
          open: true,
          type: "success",
          title: "Success",
          message: `Successfully deleted ${data.deletedCount} notification(s)`,
        });
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: error.error || "Failed to delete notifications",
        });
      }
    } catch (error) {
      console.error("Error bulk deleting notifications:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "Failed to delete notifications",
      });
    } finally {
      setDeletingBulk(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const response = await fetch("/api/notifications/bulk-delete", {
        method: "DELETE",
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications([]);
        setUnreadCount(0);
        setSelectedNotifications(new Set());
        setDeleteAllDialogOpen(false);
        setMessageDialog({
          open: true,
          type: "success",
          title: "Success",
          message: `Successfully deleted all ${data.deletedCount} notification(s)`,
        });
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: error.error || "Failed to delete all notifications",
        });
      }
    } catch (error) {
      console.error("Error deleting all notifications:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "Failed to delete all notifications",
      });
    } finally {
      setDeletingAll(false);
    }
  };

  const getNotificationLink = (notification: Notification) => {
    if (notification.caseId) {
      return `/cases/${notification.caseId}`;
    }
    if (notification.meetingId) {
      return `/meetings`;
    }
    return null;
  };

  const handleSendManualNotification = async () => {
    if (!manualTitle.trim() || !manualMessage.trim()) {
      return;
    }

    setSendingManual(true);
    try {
      const response = await fetch("/api/notifications/send-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualTitle,
          message: manualMessage,
          recipientType,
          departmentId: recipientType === "department" ? selectedDepartmentId : undefined,
          userId: recipientType === "individual" ? selectedUserId : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setManualNotificationOpen(false);
        setManualTitle("");
        setManualMessage("");
        setRecipientType("everyone");
        setSelectedDepartmentId("");
        setSelectedUserId("");
        // Refresh notifications
        fetchNotifications();
        setMessageDialog({
          open: true,
          type: "success",
          title: "Success",
          message: `Notification sent to ${data.recipientCount} recipient(s)`,
        });
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: error.error || "Failed to send notification",
        });
      }
    } catch (error) {
      console.error("Error sending manual notification:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "Failed to send notification",
      });
    } finally {
      setSendingManual(false);
    }
  };

  const handleRequestMeeting = async () => {
    setSendingRequest(true);
    try {
      const response = await fetch("/api/notifications/request-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remarks: meetingRemarks.trim() || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMeetingRequestOpen(false);
        setMeetingRemarks("");
        // Refresh notifications
        fetchNotifications();
        setMessageDialog({
          open: true,
          type: "success",
          title: "Success",
          message: `Meeting request sent to ${data.recipientCount} coordinator(s)/admin(s)`,
        });
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: error.error || "Failed to send meeting request",
        });
      }
    } catch (error) {
      console.error("Error requesting meeting:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "Failed to send meeting request",
      });
    } finally {
      setSendingRequest(false);
    }
  };

  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      MEETING_CREATED: { label: "Meeting", variant: "default" },
      MEETING_UPDATED: { label: "Meeting Updated", variant: "outline" },
      MEETING_CANCELLED: { label: "Meeting Cancelled", variant: "destructive" },
      CASE_SUBMITTED: { label: "Case", variant: "secondary" },
      CASE_RESUBMITTED: { label: "Case Resubmitted", variant: "secondary" },
      CASE_POSTPONED: { label: "Case Postponed", variant: "outline" },
      MDT_REVIEW_COMPLETED: { label: "Review", variant: "outline" },
      MANUAL_NOTIFICATION: { label: "Manual", variant: "default" },
      MEETING_REQUEST: { label: "Meeting Request", variant: "secondary" },
    };
    const typeInfo = typeMap[type] || { label: type, variant: "default" };
    return <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex gap-4">
        {isUserCoordinator && (
          <Dialog open={manualNotificationOpen} onOpenChange={setManualNotificationOpen}>
            <DialogTrigger asChild>
              <Button>
                <Send className="mr-2 h-4 w-4" />
                Send Manual Notification
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Send Manual Notification</DialogTitle>
                <DialogDescription>
                  Send a custom notification to users. All recipients will also receive this via Telegram if linked.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="manual-title">Title *</Label>
                  <Input
                    id="manual-title"
                    placeholder="Enter notification title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-message">Message *</Label>
                  <Textarea
                    id="manual-message"
                    placeholder="Enter notification message"
                    value={manualMessage}
                    onChange={(e) => setManualMessage(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipient-type">Recipient Type *</Label>
                  <Select
                    value={recipientType}
                    onValueChange={(value: "everyone" | "department" | "individual") => {
                      setRecipientType(value);
                      setSelectedDepartmentId("");
                      setSelectedUserId("");
                    }}
                  >
                    <SelectTrigger id="recipient-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="department">Department</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {recipientType === "department" && (
                  <div className="space-y-2">
                    <Label htmlFor="department-select">Department *</Label>
                    <Select
                      value={selectedDepartmentId}
                      onValueChange={setSelectedDepartmentId}
                    >
                      <SelectTrigger id="department-select">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {recipientType === "individual" && (
                  <div className="space-y-2">
                    <Label htmlFor="user-select">User *</Label>
                    <Select
                      value={selectedUserId}
                      onValueChange={setSelectedUserId}
                    >
                      <SelectTrigger id="user-select">
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name} {user.department && `(${user.department.name})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setManualNotificationOpen(false)}
                  disabled={sendingManual}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendManualNotification}
                  disabled={
                    sendingManual ||
                    !manualTitle.trim() ||
                    !manualMessage.trim() ||
                    (recipientType === "department" && !selectedDepartmentId) ||
                    (recipientType === "individual" && !selectedUserId)
                  }
                >
                  {sendingManual ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={meetingRequestOpen} onOpenChange={setMeetingRequestOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <MessageSquare className="mr-2 h-4 w-4" />
              Request MDT Meeting
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Request MDT Meeting</DialogTitle>
              <DialogDescription>
                Send a meeting request to coordinators and admins. This is helpful when you have cases for MDT discussion but no meeting has been scheduled.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="meeting-remarks">Remarks (Optional)</Label>
                <Textarea
                  id="meeting-remarks"
                  placeholder="Add any additional information or context..."
                  value={meetingRemarks}
                  onChange={(e) => setMeetingRemarks(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setMeetingRequestOpen(false)}
                disabled={sendingRequest}
              >
                Cancel
              </Button>
              <Button onClick={handleRequestMeeting} disabled={sendingRequest}>
                {sendingRequest ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Send Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Manage your notifications and view past activity
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll}
                >
                  {markingAll ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Marking...
                    </>
                  ) : (
                    <>
                      <CheckCheck className="mr-2 h-4 w-4" />
                      Mark all as read ({unreadCount})
                    </>
                  )}
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteAllDialogOpen(true)}
                  disabled={deletingAll}
                  className="text-destructive hover:text-destructive"
                >
                  {deletingAll ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash className="mr-2 h-4 w-4" />
                      Delete All
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          {notifications.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedNotifications.size === notifications.length && notifications.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <Label className="text-sm text-muted-foreground">
                  Select all ({selectedNotifications.size} selected)
                </Label>
              </div>
              {selectedNotifications.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={deletingBulk}
                >
                  {deletingBulk ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Selected ({selectedNotifications.size})
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center p-12 text-muted-foreground">
            <p>No notifications yet</p>
            <p className="text-sm mt-2">You&apos;ll see notifications here when events occur</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => {
              const link = getNotificationLink(notification);
              const isSelected = selectedNotifications.has(notification.id);
              return (
                <div
                  key={notification.id}
                  className={cn(
                    "p-4 border rounded-lg hover:bg-muted/50 transition-colors",
                    !notification.read && "bg-blue-50/50 border-blue-200",
                    isSelected && "border-primary bg-primary/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleSelect(notification.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                      {link ? (
                        <Link
                          href={link}
                          onClick={() => {
                            if (!notification.read) {
                              handleMarkAsRead(notification.id);
                            }
                          }}
                          className="block"
                        >
                        <div className="flex items-center gap-2 mb-2">
                          {getTypeBadge(notification.type)}
                          <p
                            className={cn(
                              "text-sm font-medium",
                              !notification.read && "font-semibold"
                            )}
                          >
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <div className="h-2 w-2 rounded-full bg-blue-600 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                          {notification.read && notification.readAt && (
                            <span>
                              Read {formatDistanceToNow(new Date(notification.readAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                        </Link>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            {getTypeBadge(notification.type)}
                            <p
                              className={cn(
                                "text-sm font-medium",
                                !notification.read && "font-semibold"
                              )}
                            >
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <div className="h-2 w-2 rounded-full bg-blue-600 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>
                              {formatDistanceToNow(new Date(notification.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                            {notification.read && notification.readAt && (
                              <span>
                                Read {formatDistanceToNow(new Date(notification.readAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMarkAsRead(notification.id);
                          }}
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(notification.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>

      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {notifications.length} notification(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete All"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MessageDialog
        open={messageDialog.open}
        onOpenChange={(open) => setMessageDialog((prev) => ({ ...prev, open }))}
        type={messageDialog.type}
        title={messageDialog.title}
        message={messageDialog.message}
      />
    </div>
  );
}


