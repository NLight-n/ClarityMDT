"use client";

import { useState, useEffect } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Role } from "@prisma/client";
import { Loader2, Plus, Edit, Trash2, UserPlus, UserMinus, Upload, CheckCircle2, AlertCircle, MessageCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { isAdmin } from "@/lib/permissions/client";
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

interface Department {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  loginId: string;
  role: Role;
  previousRole: Role | null;
  departmentId: string | null;
  department: Department | null;
  telegramId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function UserManagement() {
  const { data: session } = useSession();
  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;
  const isUserAdmin = user && isAdmin(user);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [userSignatures, setUserSignatures] = useState<Record<string, { url: string | null; authenticated: boolean }>>({});
  
  // MessageDialog state
  const [messageDialog, setMessageDialog] = useState<{
    open: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    loginId: string;
    password: string;
    role: Role;
    departmentId: string;
  }>({
    name: "",
    loginId: "",
    password: "",
    role: Role.Viewer,
    departmentId: "",
  });

  // Load users and departments
  useEffect(() => {
    loadUsers();
    loadDepartments();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetch("/api/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
        
        // Load signature URLs for users who have signatures (use streaming endpoint)
        const signatureMap: Record<string, { url: string | null; authenticated: boolean }> = {};
        data
          .filter((u: any) => u.signatureUrl)
          .forEach((u: any) => {
            // Use streaming endpoint directly (do not encode to preserve path)
            signatureMap[u.id] = {
              url: `/api/images/stream/${u.signatureUrl}`,
              authenticated: u.signatureAuthenticated,
            };
          });
        setUserSignatures(signatureMap);
      }
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await fetch("/api/departments");
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);
      }
    } catch (error) {
      console.error("Error loading departments:", error);
    }
  };

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        loginId: user.loginId,
        password: "",
        role: user.role,
        departmentId: user.departmentId || "",
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: "",
        loginId: "",
        password: "",
        role: Role.Viewer,
        departmentId: "",
      });
    }
    setSignatureFile(null);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
    setSignatureFile(null);
    setFormData({
      name: "",
      loginId: "",
      password: "",
      role: Role.Viewer,
      departmentId: "",
    });
  };

  const handleUploadSignature = async (userId: string) => {
    if (!signatureFile) {
      setMessageDialog({
        open: true,
        type: "error",
        title: "No File Selected",
        message: "Please select a signature image file",
      });
      return;
    }

    setUploadingSignature(true);
    try {
      const formData = new FormData();
      formData.append("file", signatureFile);

      const response = await fetch(`/api/users/${userId}/signature`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        // Reload users to get updated signature info
        await loadUsers();
        setSignatureFile(null);
        setMessageDialog({
          open: true,
          type: "success",
          title: "Success",
          message: "Signature uploaded successfully",
        });
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Upload Failed",
          message: error.error || "Failed to upload signature",
        });
      }
    } catch (error) {
      console.error("Error uploading signature:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setUploadingSignature(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
      const method = editingUser ? "PATCH" : "POST";

      const body: any = {
        name: formData.name,
        loginId: formData.loginId,
        role: formData.role,
        departmentId: formData.departmentId || null,
      };

      // Only include password if provided (for new users or when updating)
      if (formData.password) {
        body.password = formData.password;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        // Optimistic update
        if (editingUser) {
          const updatedUser = await response.json();
          setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
        } else {
          const newUser = await response.json();
          setUsers([...users, newUser]);
        }
        handleCloseDialog();
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Save Failed",
          message: error.error || "Failed to save user",
        });
      }
    } catch (error) {
      console.error("Error saving user:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;

    try {
      const response = await fetch(`/api/users/${deletingUser.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Optimistic update
        setUsers(users.filter((u) => u.id !== deletingUser.id));
        setIsDeleteDialogOpen(false);
        setDeletingUser(null);
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Delete Failed",
          message: error.error || "Failed to delete user",
        });
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    }
  };

  const handleAssignCoordinator = async (user: User) => {
    try {
      const response = await fetch(`/api/users/${user.id}/assign-coordinator`, {
        method: "PATCH",
      });

      if (response.ok) {
        const data = await response.json();
        // Optimistic update
        setUsers(users.map((u) => (u.id === data.user.id ? data.user : u)));
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Action Failed",
          message: error.error || "Failed to assign coordinator role",
        });
      }
    } catch (error) {
      console.error("Error assigning coordinator:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    }
  };

  const handleRevokeCoordinator = async (user: User) => {
    try {
      const response = await fetch(`/api/users/${user.id}/revoke-coordinator`, {
        method: "PATCH",
      });

      if (response.ok) {
        const data = await response.json();
        // Optimistic update
        setUsers(users.map((u) => (u.id === data.user.id ? data.user : u)));
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Action Failed",
          message: error.error || "Failed to revoke coordinator role",
        });
      }
    } catch (error) {
      console.error("Error revoking coordinator:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    }
  };

  const getRoleBadgeVariant = (role: Role) => {
    switch (role) {
      case Role.Admin:
        return "destructive";
      case Role.Coordinator:
        return "default";
      case Role.Consultant:
        return "secondary";
      case Role.Viewer:
        return "outline";
      default:
        return "outline";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground">Manage users and their roles</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Login ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.loginId}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {user.role}
                    </Badge>
                    {user.previousRole && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (was {user.previousRole})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{user.department?.name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {/* Edit Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleOpenDialog(user)}
                        title="Edit user"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      
                      {/* Signature Authenticated Indicator */}
                      {userSignatures[user.id] && (
                        <div 
                          className="flex items-center justify-center h-8 w-8" 
                          title={userSignatures[user.id].authenticated ? "Signature authenticated" : "Signature pending authentication"}
                        >
                          {userSignatures[user.id].authenticated ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                          )}
                        </div>
                      )}
                      
                      {/* Telegram Linked Indicator */}
                      {user.telegramId && (
                        <div 
                          className="flex items-center justify-center h-8 w-8" 
                          title="Telegram linked"
                        >
                          <MessageCircle className="h-4 w-4 text-blue-600" />
                        </div>
                      )}
                      
                      {/* Assign/Revoke Coordinator Button */}
                      {isUserAdmin && (
                        <>
                          {user.role === Role.Coordinator ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleRevokeCoordinator(user)}
                              title="Revoke Coordinator"
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          ) : (user.role === Role.Consultant || user.role === Role.Viewer) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleAssignCoordinator(user)}
                              title="Assign Coordinator"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </>
                      )}
                      
                      {/* Delete Button */}
                      {isUserAdmin && user.id !== session?.user?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setDeletingUser(user);
                            setIsDeleteDialogOpen(true);
                          }}
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? "Edit User" : "Add New User"}
              </DialogTitle>
              <DialogDescription>
                {editingUser
                  ? "Update user information below."
                  : "Create a new user account."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="loginId">Login ID</Label>
                <Input
                  id="loginId"
                  value={formData.loginId}
                  onChange={(e) =>
                    setFormData({ ...formData, loginId: e.target.value })
                  }
                  required
                  disabled={!!editingUser}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">
                  Password {editingUser && "(leave empty to keep current)"}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required={!editingUser}
                  minLength={6}
                  disabled={Boolean(
                    editingUser && (
                      (editingUser.role === Role.Admin && !isUserAdmin) ||
                      (editingUser.id === user?.id)
                    )
                  )}
                />
                {editingUser && editingUser.role === Role.Admin && !isUserAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Cannot change password for Admin users
                  </p>
                )}
                {editingUser && editingUser.id === user?.id && (
                  <p className="text-xs text-muted-foreground">
                    Cannot change your own password here. Please use the Profile page.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => {
                    if (!isUserAdmin && (value === Role.Admin || value === Role.Coordinator)) {
                      return; // Don't allow coordinators to set Admin or Coordinator roles
                    }
                    setFormData({ ...formData, role: value as Role });
                  }}
                  disabled={!isUserAdmin && (formData.role === Role.Admin || formData.role === Role.Coordinator)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isUserAdmin ? (
                      <>
                        <SelectItem value={Role.Admin}>Admin</SelectItem>
                        <SelectItem value={Role.Coordinator}>Coordinator</SelectItem>
                        <SelectItem value={Role.Consultant}>Consultant</SelectItem>
                        <SelectItem value={Role.Viewer}>Viewer</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value={Role.Consultant}>Consultant</SelectItem>
                        <SelectItem value={Role.Viewer}>Viewer</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                {!isUserAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Coordinators cannot assign Admin or Coordinator roles
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="department">Department</Label>
                <Select
                  value={formData.departmentId || "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, departmentId: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Signature Upload Section (only when editing existing user) */}
              {editingUser && (
                <div className="space-y-2 border-t pt-4">
                  <Label>Digital Signature</Label>
                  {userSignatures[editingUser.id]?.url ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="border rounded p-2 bg-gray-50">
                          <img
                            src={userSignatures[editingUser.id].url!}
                            alt="Signature"
                            className="h-12 object-contain"
                          />
                        </div>
                        <div className="flex-1">
                          {userSignatures[editingUser.id].authenticated ? (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Authenticated</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-amber-600">
                              <AlertCircle className="h-4 w-4" />
                              <span>Pending Authentication</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Upload a new signature image to replace the existing one.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No signature uploaded. Upload a signature image (PNG/JPEG, max 2MB).
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Validate file type
                          if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
                            setMessageDialog({
                              open: true,
                              type: "error",
                              title: "Invalid File Type",
                              message: "Only PNG and JPEG images are allowed",
                            });
                            return;
                          }
                          // Validate file size (2MB)
                          if (file.size > 2 * 1024 * 1024) {
                            setMessageDialog({
                              open: true,
                              type: "error",
                              title: "File Too Large",
                              message: "File size must be less than 2MB",
                            });
                            return;
                          }
                          setSignatureFile(file);
                        }
                      }}
                      disabled={uploadingSignature}
                    />
                    {signatureFile && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleUploadSignature(editingUser.id)}
                        disabled={uploadingSignature}
                      >
                        {uploadingSignature ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingUser ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete user &quot;{deletingUser?.name}&quot;. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingUser(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Message Dialog */}
      <MessageDialog
        open={messageDialog.open}
        onOpenChange={(open) => setMessageDialog({ ...messageDialog, open })}
        type={messageDialog.type}
        title={messageDialog.title}
        message={messageDialog.message}
      />
    </div>
  );
}

