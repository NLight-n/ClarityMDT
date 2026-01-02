"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";

interface ProfileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileSidebar({ open, onOpenChange }: ProfileSidebarProps) {
  const { data: session, update } = useSession();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    loginId: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch user data including department name
  useEffect(() => {
    const fetchUserData = async () => {
      if (open && session?.user?.id) {
        setLoading(true);
        try {
          const response = await fetch(`/api/profile`);
          if (response.ok) {
            const userData = await response.json();
            setFormData({
              name: userData.name || "",
              loginId: userData.loginId || "",
              password: "",
              confirmPassword: "",
            });
            setDepartmentName(userData.department?.name || null);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchUserData();
  }, [open, session?.user?.id]);

  const handleSave = async () => {
    setErrors({});
    
    // Validate password if provided
    if (formData.password) {
      if (formData.password.length < 6) {
        setErrors({ password: "Password must be at least 6 characters" });
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setErrors({ confirmPassword: "Passwords do not match" });
        return;
      }
    }

    // Validate name and loginId
    if (!formData.name.trim()) {
      setErrors({ name: "Name is required" });
      return;
    }
    if (!formData.loginId.trim()) {
      setErrors({ loginId: "User ID is required" });
      return;
    }

    setSaving(true);
    try {
      const updateData: {
        name?: string;
        loginId?: string;
        password?: string;
      } = {};

      if (formData.name !== session?.user?.name) {
        updateData.name = formData.name.trim();
      }
      if (formData.loginId !== session?.user?.loginId) {
        updateData.loginId = formData.loginId.trim();
      }
      if (formData.password) {
        updateData.password = formData.password;
      }

      const response = await fetch(`/api/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const updatedData = await response.json();
        // Update session with new data
        await update({
          name: updatedData.name,
          loginId: updatedData.loginId,
        });
        // Update department name if available
        if (updatedData.departmentName) {
          setDepartmentName(updatedData.departmentName);
        }
        // Clear password fields
        setFormData((prev) => ({
          ...prev,
          password: "",
          confirmPassword: "",
        }));
        alert("Profile updated successfully");
      } else {
        const error = await response.json();
        if (error.error === "Login ID already exists") {
          setErrors({ loginId: "User ID already exists" });
        } else {
          alert(error.error || "Failed to update profile");
        }
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form data will be handled by the fetchUserData effect when reopening
    setErrors({});
    onOpenChange(false);
  };

  if (!session?.user) {
    return null;
  }

  const userRole = session.user.role as Role;
  const displayDepartmentName = departmentName || "N/A";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Profile</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
          {/* Role and Department (Non-editable) */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Role</Label>
              <div className="mt-1">
                <Badge variant="secondary" className="text-sm">
                  {userRole}
                </Badge>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Department</Label>
              <div className="mt-1">
                <Badge variant="outline" className="text-sm">
                  {displayDepartmentName}
                </Badge>
              </div>
            </div>
          </div>

          {/* Editable Fields */}
          <div className="space-y-4 border-t pt-6">
            <div className="space-y-2">
              <Label htmlFor="name">
                Username <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                disabled={saving}
                placeholder="Enter your name"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="loginId">
                User ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="loginId"
                value={formData.loginId}
                onChange={(e) =>
                  setFormData({ ...formData, loginId: e.target.value })
                }
                disabled={saving}
                placeholder="Enter user ID"
              />
              {errors.loginId && (
                <p className="text-sm text-destructive">{errors.loginId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                disabled={saving}
                placeholder="Leave blank to keep current password"
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            {formData.password && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  Confirm Password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      confirmPassword: e.target.value,
                    })
                  }
                  disabled={saving}
                  placeholder="Confirm new password"
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
              className="flex-1"
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

