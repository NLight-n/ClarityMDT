"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Upload, X, Eye, EyeOff } from "lucide-react";
import { useSession } from "next-auth/react";
import { isAdmin } from "@/lib/permissions/client";

interface TelegramSettings {
  enabled: boolean;
  botName: string | null;
  botToken: string | null;
  qrCodeUrl: string | null;
}

export function TelegramSettings() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<TelegramSettings>({
    enabled: false,
    botName: null,
    botToken: null,
    qrCodeUrl: null,
  });
  const [formData, setFormData] = useState({
    enabled: false,
    botName: "",
    botToken: "",
    qrCodeImage: "",
  });
  const [showToken, setShowToken] = useState(false);
  const [qrCodePreview, setQrCodePreview] = useState<string | null>(null);

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
      botName: settings.botName || "",
      botToken: settings.botToken === "***masked***" ? "" : (settings.botToken || ""),
      qrCodeImage: "",
    });
    if (settings.qrCodeUrl) {
      loadQrCodePreview(settings.qrCodeUrl);
    }
  }, [settings]);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/admin/telegram-settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error loading Telegram settings:", error);
      setError("Failed to load Telegram settings");
    } finally {
      setLoading(false);
    }
  };

  const loadQrCodePreview = async (storageKey: string) => {
    try {
      // Use streaming endpoint directly
      setQrCodePreview(`/api/admin/telegram-settings/qr-preview?key=${encodeURIComponent(storageKey)}`);
    } catch (error) {
      console.error("Error loading QR code preview:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      // Build request body - only include fields that have values or are being explicitly updated
      const requestBody: any = {
        enabled: formData.enabled,
        botName: formData.botName.trim() || null,
      };

      // Only include botToken if it has a value (not empty string)
      // If empty, don't send it so the API preserves the existing encrypted token
      if (formData.botToken && formData.botToken.trim() !== "") {
        requestBody.botToken = formData.botToken;
      }

      // Only include qrCodeImage if it has a value (new upload)
      // If empty, don't send it so the API preserves the existing QR code
      if (formData.qrCodeImage && formData.qrCodeImage.trim() !== "") {
        requestBody.qrCodeImage = formData.qrCodeImage;
      }

      const response = await fetch("/api/admin/telegram-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings(updatedSettings);
        setSuccess("Telegram settings saved successfully");
        // Clear form data for sensitive fields (but preserve botName)
        setFormData({
          ...formData,
          botToken: "", // Clear token field (but don't send empty to API)
          qrCodeImage: "", // Clear QR code field (but don't send empty to API)
        });
        setShowToken(false);
        // Reload QR code preview if it exists
        if (updatedSettings.qrCodeUrl) {
          loadQrCodePreview(updatedSettings.qrCodeUrl);
        } else {
          setQrCodePreview(null);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to save Telegram settings");
      }
    } catch (error) {
      console.error("Error saving Telegram settings:", error);
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
      // Convert to base64 for upload
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData({ ...formData, qrCodeImage: base64String });
        setQrCodePreview(base64String);
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
            Only administrators can manage Telegram settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram Settings</CardTitle>
        <CardDescription>
          Configure Telegram bot for user account linking and notifications
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
              <Label htmlFor="enabled">Enable Telegram Linking</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, users can link their Telegram accounts for notifications
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
              <div className="space-y-2">
                <Label htmlFor="botName">Bot Username</Label>
                <Input
                  id="botName"
                  value={formData.botName}
                  onChange={(e) => setFormData({ ...formData, botName: e.target.value })}
                  placeholder="Enter bot username (without @)"
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  The Telegram bot username (e.g., &quot;mybot&quot; for @mybot)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="botToken">Bot Token</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="botToken"
                    type={showToken ? "text" : "password"}
                    value={formData.botToken}
                    onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                    placeholder={settings.botToken === "***masked***" ? "Token is set (leave empty to keep current)" : "Enter bot token"}
                    disabled={saving}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowToken(!showToken)}
                    disabled={saving}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {settings.botToken === "***masked***" 
                    ? "Token is encrypted and stored securely. Leave empty to keep current token, or enter a new token to update."
                    : "Get your bot token from @BotFather on Telegram"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qrCode">QR Code Image</Label>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="qr-upload"
                    className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload QR Code
                  </label>
                  <input
                    id="qr-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={saving}
                  />
                  {(qrCodePreview || formData.qrCodeImage) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFormData({ ...formData, qrCodeImage: "" });
                        setQrCodePreview(null);
                      }}
                      disabled={saving}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload a QR code image that users can scan to quickly access the bot
                </p>
                {(qrCodePreview || formData.qrCodeImage) && (
                  <div className="mt-2">
                    <img
                      src={qrCodePreview || formData.qrCodeImage || ""}
                      alt="QR Code Preview"
                      className="h-32 w-32 border rounded-lg object-contain"
                    />
                  </div>
                )}
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

