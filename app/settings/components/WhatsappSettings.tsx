"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Eye, EyeOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { isAdmin } from "@/lib/permissions/client";
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
import { Textarea } from "@/components/ui/textarea";
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

interface WhatsappSettingsData {
  enabled: boolean;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  accessToken: string | null;
}

interface WhatsappTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  metaTemplateId: string | null;
  notificationType: string | null;
  createdAt: string;
}

const NOTIFICATION_TYPES = [
  { value: "", label: "None (Generic)" },
  { value: "MEETING_CREATED", label: "Meeting Created" },
  { value: "MEETING_UPDATED", label: "Meeting Updated" },
  { value: "MEETING_CANCELLED", label: "Meeting Cancelled" },
  { value: "CASE_SUBMITTED", label: "Case Submitted" },
  { value: "CASE_RESUBMITTED", label: "Case Resubmitted" },
  { value: "CASE_POSTPONED", label: "Case Postponed" },
  { value: "MDT_REVIEW_COMPLETED", label: "MDT Review Completed" },
  { value: "MANUAL_NOTIFICATION", label: "Manual Notification" },
  { value: "MEETING_REQUEST", label: "Meeting Request" },
];

const TEMPLATE_CATEGORIES = [
  { value: "AUTHENTICATION", label: "Authentication" },
  { value: "MARKETING", label: "Marketing" },
  { value: "UTILITY", label: "Utility" },
];

export function WhatsappSettings() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<WhatsappSettingsData>({
    enabled: false,
    phoneNumberId: null,
    businessAccountId: null,
    accessToken: null,
  });
  const [formData, setFormData] = useState({
    enabled: false,
    phoneNumberId: "",
    businessAccountId: "",
    accessToken: "",
  });
  const [showToken, setShowToken] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<WhatsappTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    category: "UTILITY",
    language: "en_US",
    headerText: "",
    bodyText: "",
    footerText: "",
    notificationType: "",
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
    loadTemplates();
  }, []);

  useEffect(() => {
    setFormData({
      enabled: settings.enabled,
      phoneNumberId: settings.phoneNumberId || "",
      businessAccountId: settings.businessAccountId || "",
      accessToken: settings.accessToken === "***masked***" ? "" : (settings.accessToken || ""),
    });
  }, [settings]);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/admin/whatsapp-settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error loading WhatsApp settings:", error);
      setError("Failed to load WhatsApp settings");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch("/api/admin/whatsapp-templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const requestBody: any = {
        enabled: formData.enabled,
        phoneNumberId: formData.phoneNumberId.trim() || null,
        businessAccountId: formData.businessAccountId.trim() || null,
      };

      if (formData.accessToken && formData.accessToken.trim() !== "") {
        requestBody.accessToken = formData.accessToken;
      }

      const response = await fetch("/api/admin/whatsapp-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings(updatedSettings);
        setSuccess("WhatsApp settings saved successfully");
        setFormData({
          ...formData,
          accessToken: "",
        });
        setShowToken(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to save WhatsApp settings");
      }
    } catch (error) {
      console.error("Error saving WhatsApp settings:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplate = async () => {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/whatsapp-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateForm.name,
          category: templateForm.category,
          language: templateForm.language,
          headerText: templateForm.headerText || undefined,
          bodyText: templateForm.bodyText,
          footerText: templateForm.footerText || undefined,
          notificationType: templateForm.notificationType || undefined,
        }),
      });

      if (response.ok) {
        await loadTemplates();
        setCreateDialogOpen(false);
        setTemplateForm({
          name: "",
          category: "UTILITY",
          language: "en_US",
          headerText: "",
          bodyText: "",
          footerText: "",
          notificationType: "",
        });
        setSuccess("Template created and submitted for approval");
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create template");
      }
    } catch (error) {
      console.error("Error creating template:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleSyncTemplates = async () => {
    setSyncing(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/whatsapp-templates/sync", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates);
        setSuccess(`Synced ${data.synced} template(s) from Meta`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to sync templates");
      }
    } catch (error) {
      console.error("Error syncing templates:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    setDeleting(true);

    try {
      const response = await fetch(`/api/admin/whatsapp-templates/${deletingTemplate.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadTemplates();
        setDeleteDialogOpen(false);
        setDeletingTemplate(null);
        setSuccess("Template deleted successfully");
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to delete template");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateNotificationType = async (templateId: string, notificationType: string) => {
    try {
      const response = await fetch(`/api/admin/whatsapp-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationType: notificationType || null }),
      });

      if (response.ok) {
        await loadTemplates();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to update template");
      }
    } catch (error) {
      console.error("Error updating template:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge className="bg-green-600">Approved</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Rejected</Badge>;
      case "PENDING":
      default:
        return <Badge variant="secondary">Pending</Badge>;
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
            Only administrators can manage WhatsApp settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Settings</CardTitle>
          <CardDescription>
            Configure WhatsApp Business API for user notifications. Requires a Meta Business Account with WhatsApp Cloud API access.
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
                <Label htmlFor="wa-enabled">Enable WhatsApp Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, users can receive notifications via WhatsApp
                </p>
              </div>
              <Switch
                id="wa-enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                disabled={saving}
              />
            </div>

            {formData.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                  <Input
                    id="phoneNumberId"
                    value={formData.phoneNumberId}
                    onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })}
                    placeholder="Enter Meta Phone Number ID"
                    disabled={saving}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in Meta Business Dashboard → WhatsApp → API Setup
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessAccountId">Business Account ID (WABA ID)</Label>
                  <Input
                    id="businessAccountId"
                    value={formData.businessAccountId}
                    onChange={(e) => setFormData({ ...formData, businessAccountId: e.target.value })}
                    placeholder="Enter WhatsApp Business Account ID"
                    disabled={saving}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your WhatsApp Business Account ID from Meta Business settings
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accessToken">Access Token</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="accessToken"
                      type={showToken ? "text" : "password"}
                      value={formData.accessToken}
                      onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                      placeholder={settings.accessToken === "***masked***" ? "Token is set (leave empty to keep current)" : "Enter System User access token"}
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
                    {settings.accessToken === "***masked***"
                      ? "Token is encrypted and stored securely. Leave empty to keep current token."
                      : "System User access token with whatsapp_business_management and whatsapp_business_messaging permissions"}
                  </p>
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

      {/* Template Management Card */}
      {settings.enabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Message Templates</CardTitle>
                <CardDescription>
                  Manage WhatsApp message templates. Templates must be approved by Meta before they can be used for sending notifications.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncTemplates}
                  disabled={syncing}
                >
                  {syncing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sync Status
                </Button>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[550px]">
                    <DialogHeader>
                      <DialogTitle>Create Message Template</DialogTitle>
                      <DialogDescription>
                        Create a new WhatsApp message template. It will be automatically submitted to Meta for approval.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                      <div className="space-y-2">
                        <Label htmlFor="template-name">Template Name *</Label>
                        <Input
                          id="template-name"
                          value={templateForm.name}
                          onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                          placeholder="e.g., case_submitted_notification"
                          disabled={creating}
                        />
                        <p className="text-xs text-muted-foreground">
                          Lowercase letters, numbers, and underscores only
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="template-category">Category *</Label>
                          <Select
                            value={templateForm.category}
                            onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
                            disabled={creating}
                          >
                            <SelectTrigger id="template-category">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TEMPLATE_CATEGORIES.map((cat) => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="template-language">Language</Label>
                          <Input
                            id="template-language"
                            value={templateForm.language}
                            onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}
                            placeholder="en_US"
                            disabled={creating}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="template-header">Header (Optional)</Label>
                        <Input
                          id="template-header"
                          value={templateForm.headerText}
                          onChange={(e) => setTemplateForm({ ...templateForm, headerText: e.target.value })}
                          placeholder="e.g., ClarityMDT Notification"
                          disabled={creating}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="template-body">Body Text *</Label>
                        <Textarea
                          id="template-body"
                          value={templateForm.bodyText}
                          onChange={(e) => setTemplateForm({ ...templateForm, bodyText: e.target.value })}
                          placeholder={"Use {{1}}, {{2}} for dynamic content.\ne.g., {{1}} - New case submitted: {{2}}"}
                          rows={4}
                          disabled={creating}
                        />
                        <p className="text-xs text-muted-foreground">
                          Use {"{{1}}"}, {"{{2}}"}, etc. as placeholders for dynamic content
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="template-footer">Footer (Optional)</Label>
                        <Input
                          id="template-footer"
                          value={templateForm.footerText}
                          onChange={(e) => setTemplateForm({ ...templateForm, footerText: e.target.value })}
                          placeholder="e.g., ClarityMDT App"
                          disabled={creating}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="template-notification-type">Map to Notification Type</Label>
                        <Select
                          value={templateForm.notificationType}
                          onValueChange={(value) => setTemplateForm({ ...templateForm, notificationType: value })}
                          disabled={creating}
                        >
                          <SelectTrigger id="template-notification-type">
                            <SelectValue placeholder="Select notification type" />
                          </SelectTrigger>
                          <SelectContent>
                            {NOTIFICATION_TYPES.map((type) => (
                              <SelectItem key={type.value || "none"} value={type.value || "none"}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          When this notification type is triggered, this template will be used automatically
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setCreateDialogOpen(false)}
                        disabled={creating}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateTemplate}
                        disabled={creating || !templateForm.name || !templateForm.bodyText}
                      >
                        {creating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Plus className="mr-2 h-4 w-4" />
                            Create & Submit
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingTemplates ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <p>No templates created yet</p>
                <p className="text-sm mt-2">Create your first template to start sending WhatsApp notifications</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="p-4 border rounded-lg space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{template.name}</span>
                          {getStatusBadge(template.status)}
                          <Badge variant="outline">{template.category}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{template.bodyText}</p>
                        {template.headerText && (
                          <p className="text-xs text-muted-foreground">Header: {template.headerText}</p>
                        )}
                        {template.footerText && (
                          <p className="text-xs text-muted-foreground">Footer: {template.footerText}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeletingTemplate(template);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Notification Type:</Label>
                      <Select
                        value={template.notificationType || "none"}
                        onValueChange={(value) =>
                          handleUpdateNotificationType(template.id, value === "none" ? "" : value)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTIFICATION_TYPES.map((type) => (
                            <SelectItem key={type.value || "none"} value={type.value || "none"}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the template &quot;{deletingTemplate?.name}&quot;?
              This will also delete it from Meta&apos;s servers. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
