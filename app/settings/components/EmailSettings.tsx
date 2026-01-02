"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Eye, EyeOff } from "lucide-react";
import { useSession } from "next-auth/react";
import { isAdmin } from "@/lib/permissions/client";

interface EmailSettings {
  enabled: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromEmail: string | null;
  fromName: string | null;
}

export function EmailSettings() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<EmailSettings>({
    enabled: false,
    host: null,
    port: null,
    secure: false,
    username: null,
    password: null,
    fromEmail: null,
    fromName: null,
  });
  const [formData, setFormData] = useState({
    enabled: false,
    host: "",
    port: "",
    secure: false,
    username: "",
    password: "",
    fromEmail: "",
    fromName: "",
  });
  const [showPassword, setShowPassword] = useState(false);

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
      enabled: settings.enabled,
      host: settings.host || "",
      port: settings.port?.toString() || "",
      secure: settings.secure,
      username: settings.username || "",
      password: settings.password === "***masked***" ? "" : (settings.password || ""),
      fromEmail: settings.fromEmail || "",
      fromName: settings.fromName || "",
    });
  }, [settings]);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/admin/email-settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error loading Email settings:", error);
      setError("Failed to load Email settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const response = await fetch("/api/admin/email-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: formData.enabled,
          host: formData.host.trim() || null,
          port: formData.port ? parseInt(formData.port) : null,
          secure: formData.secure,
          username: formData.username.trim() || null,
          password: formData.password || null,
          fromEmail: formData.fromEmail.trim() || null,
          fromName: formData.fromName.trim() || null,
        }),
      });

      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings(updatedSettings);
        setSuccess("Email settings saved successfully");
        // Clear password field
        setFormData({
          ...formData,
          password: "",
        });
        setShowPassword(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to save Email settings");
      }
    } catch (error) {
      console.error("Error saving Email settings:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setSaving(false);
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
            Only administrators can manage Email settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Settings</CardTitle>
        <CardDescription>
          Configure SMTP server for email notifications
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-600">
              {success}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enabled">Enable Email Notifications</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, users can receive email notifications
              </p>
            </div>
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              disabled={saving}
            />
          </div>

          {formData.enabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">SMTP Host</Label>
                  <Input
                    id="host"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    placeholder="smtp.example.com"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">SMTP Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    placeholder="587"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="secure">Use TLS/SSL</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable for secure connections (usually port 465 uses SSL, 587 uses TLS)
                  </p>
                </div>
                <Switch
                  id="secure"
                  checked={formData.secure}
                  onCheckedChange={(checked) => setFormData({ ...formData, secure: checked })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">SMTP Username</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="your-email@example.com"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">SMTP Password</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={settings.password === "***masked***" ? "Password is set (leave empty to keep current)" : "Enter SMTP password"}
                    disabled={saving}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={saving}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {settings.password === "***masked***" 
                    ? "Password is encrypted and stored securely. Leave empty to keep current password, or enter a new password to update."
                    : "Enter your SMTP authentication password"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fromEmail">From Email Address</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    value={formData.fromEmail}
                    onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                    placeholder="noreply@example.com"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fromName">From Name</Label>
                  <Input
                    id="fromName"
                    value={formData.fromName}
                    onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
                    placeholder="MDT App"
                    disabled={saving}
                  />
                </div>
              </div>
            </>
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

