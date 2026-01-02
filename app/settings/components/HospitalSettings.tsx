"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Upload, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { isAdmin } from "@/lib/permissions/client";

interface HospitalSettings {
  name: string | null;
  logoUrl: string | null;
}

export function HospitalSettings() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<HospitalSettings>({
    name: null,
    logoUrl: null,
  });
  const [formData, setFormData] = useState({
    name: "",
    logoUrl: "",
  });

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const canEdit = user && isAdmin(user);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    setFormData({
      name: settings.name || "",
      logoUrl: settings.logoUrl || "",
    });
  }, [settings]);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/hospital-settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error loading hospital settings:", error);
      setError("Failed to load hospital settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setError(null);
    setSaving(true);

    try {
      const response = await fetch("/api/hospital-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim() || null,
          logoUrl: formData.logoUrl.trim() || null,
        }),
      });

      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings(updatedSettings);
        // Trigger a page refresh to update the topbar
        window.location.reload();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to save hospital settings");
      }
    } catch (error) {
      console.error("Error saving hospital settings:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5MB");
      return;
    }

    try {
      // Convert to base64 for now (in production, upload to MinIO or similar)
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData({ ...formData, logoUrl: base64String });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error reading file:", error);
      setError("Failed to read image file");
    }
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

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Only administrators can manage hospital settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hospital Settings</CardTitle>
        <CardDescription>
          Configure the hospital name and logo displayed in the topbar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Hospital Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter hospital name"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              This will be displayed in the topbar. Leave empty to hide.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logoUrl">Hospital Logo URL</Label>
            <Input
              id="logoUrl"
              value={formData.logoUrl}
              onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
              placeholder="Enter logo image URL or upload image"
              disabled={saving}
            />
            <div className="flex items-center gap-2">
              <label
                htmlFor="logo-upload"
                className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </label>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={saving}
              />
              {formData.logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, logoUrl: "" })}
                  disabled={saving}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a URL or upload an image. The logo will be displayed in the topbar.
            </p>
          </div>

          {/* Preview */}
          {(formData.name || formData.logoUrl) && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center gap-4">
                  {formData.logoUrl ? (
                    <div className="relative h-10 w-auto max-w-[200px] flex items-center">
                      <img
                        src={formData.logoUrl}
                        alt={formData.name || "Hospital Logo"}
                        className="h-full w-auto object-contain"
                        style={{ maxHeight: "40px" }}
                      />
                    </div>
                  ) : null}
                  {formData.name ? (
                    <h2 className="text-lg font-semibold">{formData.name}</h2>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

