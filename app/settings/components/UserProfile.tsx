"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, X, CheckCircle2, AlertCircle, MessageSquare, Copy, Check, Shield } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { MessageDialog } from "@/components/ui/message-dialog";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KNOWN_COUNTRY_CODES = [
  { value: "+91", label: "🇮🇳 +91" },
  { value: "+1", label: "🇺🇸/🇨🇦 +1" },
  { value: "+44", label: "🇬🇧 +44" },
  { value: "+61", label: "🇦🇺 +61" },
  { value: "+971", label: "🇦🇪 +971" },
  { value: "+65", label: "🇸🇬 +65" },
  { value: "+92", label: "🇵🇰 +92" },
  { value: "+880", label: "🇧🇩 +880" },
];
const KNOWN_CODES = KNOWN_COUNTRY_CODES.map(c => c.value);

export function UserProfile() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signatureAuthenticated, setSignatureAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string>("");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [unlinkingTelegram, setUnlinkingTelegram] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [checkingLinkStatus, setCheckingLinkStatus] = useState(false);
  const [linkCheckInterval, setLinkCheckInterval] = useState<NodeJS.Timeout | null>(null);
  // Manual linking state
  const [manualLinking, setManualLinking] = useState(false);
  const [manualTelegramId, setManualTelegramId] = useState("");
  const [manualVerificationCode, setManualVerificationCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [manualBotUsername, setManualBotUsername] = useState<string>("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [telegramEnabled, setTelegramEnabled] = useState<boolean | null>(null);
  // WhatsApp state
  const [whatsappPhone, setWhatsappPhone] = useState<string>("");
  const [whatsappOptInChecked, setWhatsappOptInChecked] = useState<boolean>(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean | null>(null);
  const [whatsappOtpDialogOpen, setWhatsappOtpDialogOpen] = useState(false);
  const [whatsappOtp, setWhatsappOtp] = useState("");
  const [sendingWhatsappOtp, setSendingWhatsappOtp] = useState(false);
  const [verifyingWhatsappOtp, setVerifyingWhatsappOtp] = useState(false);
  const [pendingWhatsappPhone, setPendingWhatsappPhone] = useState<string | null>(null);
  const [whatsappVerificationToken, setWhatsappVerificationToken] = useState<string | null>(null);
  // Phone country Code state
  const [phoneCountryCode, setPhoneCountryCode] = useState("+91");
  const [originalPhoneNumber, setOriginalPhoneNumber] = useState<string | null>(null);
  // Two-Factor Authentication state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [preferredTwoFactorChannel, setPreferredTwoFactorChannel] = useState<string>("TELEGRAM");
  const [toggling2FA, setToggling2FA] = useState(false);
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
  const [formData, setFormData] = useState({
    name: "",
    loginId: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    email: "",
    medicalCouncilNumber: "",
    degrees: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch user data including department name
  useEffect(() => {
    const fetchUserData = async () => {
      if (session?.user?.id) {
        setLoading(true);
        try {
          // Fetch hospital settings for default country code first
          let defaultCode = "+91";
          try {
            const hospitalResponse = await fetch("/api/hospital-settings");
            if (hospitalResponse.ok) {
              const hospitalData = await hospitalResponse.json();
              if (hospitalData.defaultCountryCode) {
                defaultCode = hospitalData.defaultCountryCode;
              }
            }
          } catch (e) {
            console.error(e);
          }

          const response = await fetch(`/api/profile`);
          if (response.ok) {
            const userData = await response.json();
            
            setOriginalPhoneNumber(userData.phoneNumber || null);

            // Split existing normal phone if present
            if (userData.phoneNumber) {
              const match = userData.phoneNumber.match(/^(\+\d{1,4})(.*)$/);
              if (match) {
                setPhoneCountryCode(match[1]);
                userData.phoneNumber = match[2];
              } else {
                setPhoneCountryCode(defaultCode);
              }
            } else {
              setPhoneCountryCode(defaultCode);
            }

            setFormData({
              name: userData.name || "",
              loginId: userData.loginId || "",
              password: "",
              confirmPassword: "",
              phoneNumber: userData.phoneNumber || "",
              email: userData.email || "",
              medicalCouncilNumber: userData.medicalCouncilNumber || "",
              degrees: userData.degrees || "",
            });
            setDepartmentName(userData.department?.name || null);
            setSignatureUrl(userData.signatureUrl || null);
            setSignatureAuthenticated(userData.signatureAuthenticated || false);
            setTelegramId(userData.telegramId || null);
            setTwoFactorEnabled(userData.twoFactorEnabled || false);
            setPreferredTwoFactorChannel(userData.preferredTwoFactorChannel || "TELEGRAM");
            setWhatsappPhone(userData.whatsappPhone || "");
            setWhatsappOptInChecked(!!userData.whatsappPhone);
            setWhatsappVerificationToken(null);
            setPendingWhatsappPhone(null);

            // Set streaming URL for signature image if it exists
            if (userData.signatureUrl) {
              // Use streaming endpoint instead of presigned URL (do not encode to preserve path)
              setSignatureImageUrl(`/api/images/stream/${userData.signatureUrl}`);
            }
          }

          // Check if Telegram is enabled
          const telegramResponse = await fetch("/api/profile/telegram/bot-info");
          if (telegramResponse.ok) {
            const telegramData = await telegramResponse.json();
            setTelegramEnabled(telegramData.botUsername !== null);
          } else {
            setTelegramEnabled(false);
          }

          // Check if WhatsApp is enabled
          try {
            const waResponse = await fetch("/api/admin/whatsapp-settings");
            if (waResponse.ok) {
              const waData = await waResponse.json();
              setWhatsappEnabled(waData.enabled || false);
            } else {
              setWhatsappEnabled(false);
            }
          } catch {
            setWhatsappEnabled(false);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setTelegramEnabled(false);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchUserData();
  }, [session?.user?.id]);

  const handleSendManualCode = async () => {
    // Normalize input (remove @ if present, trim whitespace)
    const normalizedInput = manualTelegramId.trim().replace(/^@/, "");

    // Validate: must be either numeric ID or valid username (5-32 chars, alphanumeric + underscore)
    const isNumericId = /^\d+$/.test(normalizedInput);
    const isValidUsername = /^[a-zA-Z0-9_]{5,32}$/.test(normalizedInput);

    if (!normalizedInput || (!isNumericId && !isValidUsername)) {
      setMessageDialog({
        open: true,
        type: "error",
        title: "Invalid Input",
        message: "Please enter a valid Telegram username (e.g., @username) or numeric Telegram ID.",
      });
      return;
    }

    setSendingCode(true);
    try {
      const response = await fetch("/api/profile/telegram/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramIdentifier: normalizedInput }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      setCodeSent(true);
      setMessageDialog({
        open: true,
        type: "success",
        title: "Code Sent",
        message: "Verification code has been sent to your Telegram account. Please check your messages and enter the code below.",
      });
    } catch (error: any) {
      console.error("Error sending code:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: error.message || "Failed to send verification code. Please ensure you have started a conversation with the bot.",
      });
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyManualCode = async () => {
    if (!manualVerificationCode) {
      setMessageDialog({
        open: true,
        type: "error",
        title: "Missing Information",
        message: "Please enter the verification code you received.",
      });
      return;
    }

    setVerifyingCode(true);
    try {
      const response = await fetch("/api/profile/telegram/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: manualVerificationCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to verify code");
      }

      // Refresh user data
      const userResponse = await fetch("/api/profile");
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setTelegramId(userData.telegramId || null);
      }

      // Reset manual linking state
      setManualLinking(false);
      setManualTelegramId("");
      setManualVerificationCode("");
      setCodeSent(false);

      setMessageDialog({
        open: true,
        type: "success",
        title: "Success",
        message: "Telegram account linked successfully!",
      });
    } catch (error: any) {
      console.error("Error verifying code:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Verification Failed",
        message: error.message || "Invalid verification code. Please try again.",
      });
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleGenerateTelegramCode = async () => {
    setGeneratingCode(true);
    try {
      const response = await fetch("/api/profile/telegram/generate-code", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setVerificationCode(data.code);
        setBotUsername(data.botUsername);
        setCodeCopied(false);

        // Start checking if Telegram was linked (poll every 3 seconds for max 10 minutes)
        startLinkStatusCheck();
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: error.error || "Failed to generate verification code",
        });
      }
    } catch (error) {
      console.error("Error generating code:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setGeneratingCode(false);
    }
  };

  const startLinkStatusCheck = () => {
    // Clear any existing interval
    if (linkCheckInterval) {
      clearInterval(linkCheckInterval);
    }

    setCheckingLinkStatus(true);
    const startTime = Date.now();
    const maxDuration = 10 * 60 * 1000; // 10 minutes

    const interval = setInterval(async () => {
      // Check if 10 minutes have passed
      if (Date.now() - startTime > maxDuration) {
        clearInterval(interval);
        setLinkCheckInterval(null);
        setCheckingLinkStatus(false);
        return;
      }

      try {
        const response = await fetch("/api/profile");
        if (response.ok) {
          const userData = await response.json();

          // If Telegram ID is now set, stop checking and refresh UI
          if (userData.telegramId) {
            clearInterval(interval);
            setLinkCheckInterval(null);
            setCheckingLinkStatus(false);
            setTelegramId(userData.telegramId);
            setVerificationCode(null);
            setBotUsername("");
            // Show success message
            setMessageDialog({
              open: true,
              type: "success",
              title: "Success",
              message: "Telegram account linked successfully!",
            });
          }
        }
      } catch (error) {
        console.error("Error checking link status:", error);
      }
    }, 3000); // Check every 3 seconds

    setLinkCheckInterval(interval);
  };

  // Cleanup interval and stop polling when verification code is cleared or component unmounts
  useEffect(() => {
    // If verification code is cleared, stop polling
    if (!verificationCode && linkCheckInterval) {
      clearInterval(linkCheckInterval);
      setLinkCheckInterval(null);
      setCheckingLinkStatus(false);
      // Stop server-side polling
      fetch("/api/profile/telegram/stop-polling", {
        method: "POST",
      }).catch((error) => {
        console.error("Error stopping polling:", error);
      });
    }

    // Cleanup on unmount
    return () => {
      if (linkCheckInterval) {
        clearInterval(linkCheckInterval);
      }
      // Stop server-side polling if verification code exists
      if (verificationCode) {
        fetch("/api/profile/telegram/stop-polling", {
          method: "POST",
        }).catch((error) => {
          console.error("Error stopping polling on unmount:", error);
        });
      }
    };
  }, [verificationCode, linkCheckInterval]);

  const handleCopyCode = async () => {
    if (verificationCode) {
      await navigator.clipboard.writeText(verificationCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [oldPasswordDialogOpen, setOldPasswordDialogOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [verifyingOldPassword, setVerifyingOldPassword] = useState(false);
  const [passwordAttempts, setPasswordAttempts] = useState(0);

  const handleUnlinkTelegram = async () => {

    setUnlinkingTelegram(true);
    try {
      const response = await fetch("/api/profile/telegram", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ telegramId: null }),
      });

      if (response.ok) {
        setTelegramId(null);
        setVerificationCode(null);
        setUnlinkDialogOpen(false);
        setMessageDialog({
          open: true,
          type: "success",
          title: "Success",
          message: "Telegram account unlinked successfully",
        });
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: error.error || "Failed to unlink Telegram account",
        });
      }
    } catch (error) {
      console.error("Error unlinking Telegram:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setUnlinkingTelegram(false);
    }
  };

  const handleAuthenticateSignature = async () => {
    if (!session?.user?.id) return;

    setAuthenticating(true);
    try {
      const response = await fetch(`/api/users/${session.user.id}/authenticate-signature`, {
        method: "PATCH",
      });

      if (response.ok) {
        const data = await response.json();
        setSignatureAuthenticated(data.signatureAuthenticated);
        setMessageDialog({
          open: true,
          type: "success",
          title: "Success",
          message: "Signature authenticated successfully",
        });
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Error",
          message: error.error || "Failed to authenticate signature",
        });
      }
    } catch (error) {
      console.error("Error authenticating signature:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setAuthenticating(false);
    }
  };

  const sendWhatsappOtp = async (phone: string, openDialog = true) => {
    setSendingWhatsappOtp(true);
    try {
      const response = await fetch("/api/profile/whatsapp/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappPhone: phone }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send WhatsApp OTP");
      }

      if (openDialog) {
        setWhatsappOtpDialogOpen(true);
      }
      setMessageDialog({
        open: true,
        type: "success",
        title: "OTP Sent",
        message: "A verification OTP has been sent to your WhatsApp number.",
      });
      return true;
    } catch (error: any) {
      console.error("Error sending WhatsApp OTP:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "OTP Send Failed",
        message: error.message || "Failed to send WhatsApp OTP.",
      });
      return false;
    } finally {
      setSendingWhatsappOtp(false);
    }
  };

  const handleVerifyWhatsappOtp = async () => {
    if (!pendingWhatsappPhone) {
      setMessageDialog({
        open: true,
        type: "error",
        title: "Missing Phone",
        message: "No pending WhatsApp phone found for verification.",
      });
      return;
    }
    if (!/^\d{6}$/.test(whatsappOtp.trim())) {
      setMessageDialog({
        open: true,
        type: "error",
        title: "Invalid OTP",
        message: "Please enter the 6-digit OTP sent to WhatsApp.",
      });
      return;
    }

    setVerifyingWhatsappOtp(true);
    try {
      const response = await fetch("/api/profile/whatsapp/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappPhone: pendingWhatsappPhone,
          otp: whatsappOtp.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to verify OTP");
      }

      setWhatsappVerificationToken(data.verificationToken);
      setWhatsappOtp("");
      setWhatsappOtpDialogOpen(false);
      setMessageDialog({
        open: true,
        type: "success",
        title: "WhatsApp Verified",
        message: "OTP verified. Click Save to complete WhatsApp opt-in.",
      });
    } catch (error: any) {
      console.error("Error verifying WhatsApp OTP:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Verification Failed",
        message: error.message || "Invalid or expired OTP.",
      });
    } finally {
      setVerifyingWhatsappOtp(false);
    }
  };

  const handleSave = async (providedOldPassword?: string) => {
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

    // If password is being changed, check if old password is provided
    if (formData.password && !providedOldPassword) {
      // Reset attempts when opening dialog
      setPasswordAttempts(0);
      // Show dialog to ask for old password
      setOldPasswordDialogOpen(true);
      return;
    }

    setSaving(true);
    try {
      const updateData: {
        name?: string;
        loginId?: string;
        password?: string;
        oldPassword?: string;
        phoneNumber?: string | null;
        whatsappPhone?: string | null;
        whatsappOtpToken?: string;
        email?: string | null;
        medicalCouncilNumber?: string | null;
        degrees?: string | null;
      } = {};

      if (formData.name !== session?.user?.name) {
        updateData.name = formData.name.trim();
      }
      if (formData.loginId !== session?.user?.loginId) {
        updateData.loginId = formData.loginId.trim();
      }
      if (formData.password) {
        updateData.password = formData.password;
        if (providedOldPassword) {
          updateData.oldPassword = providedOldPassword;
        }
      }
      // Optional fields - always include them (can be empty strings which will be converted to null)
      const fullNewPhone = formData.phoneNumber.trim() ? `${phoneCountryCode}${formData.phoneNumber.trim()}` : null;
      updateData.phoneNumber = fullNewPhone;

      if (whatsappOptInChecked) {
        if (!fullNewPhone || !/^\+[1-9]\d{6,14}$/.test(fullNewPhone)) {
          setMessageDialog({
            open: true,
            type: "error",
            title: "Invalid Phone Number",
            message: "Enter a valid primary phone number before enabling WhatsApp opt-in.",
          });
          setSaving(false);
          return;
        }

        const needsVerification =
          !whatsappPhone ||
          whatsappPhone !== fullNewPhone;

        if (needsVerification) {
          if (!whatsappVerificationToken || pendingWhatsappPhone !== fullNewPhone) {
            setMessageDialog({
              open: true,
              type: "error",
              title: "WhatsApp Verification Required",
              message: "Please verify your WhatsApp number with OTP before saving.",
            });
            setSaving(false);
            return;
          }
          updateData.whatsappOtpToken = whatsappVerificationToken;
        }

        updateData.whatsappPhone = fullNewPhone;
      } else {
        updateData.whatsappPhone = null;
      }

      updateData.email = formData.email.trim() || null;
      updateData.medicalCouncilNumber = formData.medicalCouncilNumber.trim() || null;
      updateData.degrees = formData.degrees.trim() || null;

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
        setOldPassword("");
        setPasswordAttempts(0); // Reset attempts on success
        if (oldPasswordDialogOpen) {
          setOldPasswordDialogOpen(false);
        }
        
        if (whatsappOptInChecked && fullNewPhone) {
          setWhatsappPhone(fullNewPhone);
          setPendingWhatsappPhone(null);
          setWhatsappVerificationToken(null);
        } else {
          setWhatsappPhone("");
          setPendingWhatsappPhone(null);
          setWhatsappVerificationToken(null);
        }
        setOriginalPhoneNumber(fullNewPhone);

        setMessageDialog({
          open: true,
          type: "success",
          title: "Success",
          message: "Profile updated successfully",
        });
      } else {
        const error = await response.json();
        if (error.error === "Login ID already exists") {
          setErrors({ loginId: "User ID already exists" });
        } else if (error.error === "Old password is incorrect" || error.error === "Old password is required to change password") {
          // Increment failed attempts
          const newAttempts = passwordAttempts + 1;
          setPasswordAttempts(newAttempts);

          // Keep dialog open and show error
          setOldPassword("");

          // After 3 failed attempts, logout
          if (newAttempts >= 3) {
            setOldPasswordDialogOpen(false);
            setMessageDialog({
              open: true,
              type: "error",
              title: "Security Alert",
              message: "Too many failed password attempts. You will be logged out for security reasons.",
            });
            // Logout after a short delay
            setTimeout(async () => {
              await signOut({ redirect: true, callbackUrl: "/login" });
            }, 2000);
            return;
          }

          const remainingAttempts = 3 - newAttempts;
          setMessageDialog({
            open: true,
            type: "error",
            title: "Error",
            message: `Current password is incorrect. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`,
          });
        } else {
          setMessageDialog({
            open: true,
            type: "error",
            title: "Error",
            message: error.error || "Failed to update profile",
          });
        }
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOldPasswordSubmit = () => {
    if (!oldPassword.trim()) {
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "Please enter your current password",
      });
      return;
    }
    setVerifyingOldPassword(true);
    handleSave(oldPassword).finally(() => {
      setVerifyingOldPassword(false);
    });
  };

  if (!session?.user) {
    return null;
  }

  const userRole = session.user.role as Role;
  const displayDepartmentName = departmentName || "N/A";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Two Column Layout for Desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column - Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Basic Information</h3>

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

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Role</Label>
                    <div>
                      <Badge variant="secondary" className="text-sm">
                        {userRole}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Department</Label>
                    <div>
                      <Badge variant="outline" className="text-sm">
                        {displayDepartmentName}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Right Column - Optional Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Optional Information</h3>

                  {/* Telegram Section */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Telegram Notifications</Label>
                    {telegramId ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm">Account Linked</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUnlinkDialogOpen(true)}
                          disabled={unlinkingTelegram}
                          className="w-full"
                        >
                          {unlinkingTelegram ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Unlinking...
                            </>
                          ) : (
                            <>
                              <X className="mr-2 h-4 w-4" />
                              Unlink Telegram
                            </>
                          )}
                        </Button>
                      </div>
                    ) : verificationCode && botUsername ? (
                      <div className="space-y-3 p-3 border rounded-lg bg-blue-50">
                        <p className="text-xs text-muted-foreground mb-2">
                          Click to open Telegram and link your account:
                        </p>
                        <a
                          href={`https://t.me/${botUsername}?start=${verificationCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="sm">
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Open Telegram to Link
                          </Button>
                        </a>
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground mb-2">
                            Or send this code to <strong>@{botUsername}</strong>:
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 px-2 py-1.5 bg-white border rounded font-mono text-sm font-bold text-center">
                              {verificationCode}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCopyCode}
                            >
                              {codeCopied ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {checkingLinkStatus && (
                          <div className="flex items-center gap-2 text-xs text-blue-600">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Waiting for verification...</span>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            console.log("[Cancel] Stopping Telegram polling...");

                            // Clear client-side interval first
                            if (linkCheckInterval) {
                              clearInterval(linkCheckInterval);
                              setLinkCheckInterval(null);
                              console.log("[Cancel] Cleared client-side interval");
                            }
                            setCheckingLinkStatus(false);

                            // Stop server-side polling immediately
                            try {
                              console.log("[Cancel] Calling stop-polling API...");
                              const response = await fetch("/api/profile/telegram/stop-polling", { method: "POST" });
                              if (response.ok) {
                                const data = await response.json();
                                console.log("[Cancel] Stop polling response:", data);
                              } else {
                                console.error("[Cancel] Stop polling failed:", response.status, await response.text());
                              }
                            } catch (error) {
                              console.error("[Cancel] Error stopping polling:", error);
                            }

                            // Clear state
                            setVerificationCode(null);
                            setBotUsername("");
                            console.log("[Cancel] Cleared verification state");
                          }}
                          className="w-full"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {telegramEnabled === false ? (
                          <div className="p-3 border rounded-lg bg-muted/50">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-muted-foreground">
                                  Telegram Linking is Disabled
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Telegram account linking is currently disabled or not configured. Please contact an administrator to enable Telegram linking.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : !manualLinking ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleGenerateTelegramCode}
                              disabled={generatingCode || !telegramEnabled}
                              className="w-full"
                            >
                              {generatingCode ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <MessageSquare className="mr-2 h-4 w-4" />
                                  Link Telegram Account (Bot)
                                </>
                              )}
                            </Button>
                            <div className="relative">
                              <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                              </div>
                              <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">Or</span>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                setManualLinking(true);
                                // Fetch bot username and QR code when manual linking is enabled
                                try {
                                  const response = await fetch("/api/profile/telegram/bot-info");
                                  if (response.ok) {
                                    const data = await response.json();
                                    setManualBotUsername(data.botUsername || "");
                                    // Use QR preview endpoint if qrCodeUrl is provided
                                    if (data.qrCodeUrl) {
                                      // Check if it's a presigned URL (old data) or API endpoint
                                      if (data.qrCodeUrl.includes('minio:9000') || data.qrCodeUrl.includes('X-Amz-')) {
                                        // It's a presigned URL - can't use it, user needs to re-upload QR code
                                        setQrCodeUrl(null);
                                      } else if (data.qrCodeUrl.startsWith('/api/')) {
                                        // It's already a relative API endpoint URL (from bot-info API)
                                        setQrCodeUrl(data.qrCodeUrl);
                                      } else if (data.qrCodeUrl.startsWith('http') && data.qrCodeUrl.includes('/api/')) {
                                        // It's a full API endpoint URL
                                        setQrCodeUrl(data.qrCodeUrl);
                                      } else {
                                        // It's a storage key - use the QR preview endpoint
                                        setQrCodeUrl(`/api/profile/telegram/qr-preview/${data.qrCodeUrl}`);
                                      }
                                    } else {
                                      setQrCodeUrl(null);
                                    }

                                    // Check if Telegram is actually enabled
                                    if (!data.botUsername) {
                                      setMessageDialog({
                                        open: true,
                                        type: "error",
                                        title: "Telegram Not Available",
                                        message: "Telegram account linking is currently disabled or not configured. Please contact an administrator to enable Telegram linking.",
                                      });
                                      setManualLinking(false);
                                    }
                                  }
                                } catch (error) {
                                  console.error("Error fetching bot information:", error);
                                  setMessageDialog({
                                    open: true,
                                    type: "error",
                                    title: "Error",
                                    message: "Failed to fetch Telegram bot information. Please try again.",
                                  });
                                  setManualLinking(false);
                                }
                              }}
                              disabled={!telegramEnabled}
                              className="w-full"
                            >
                              <MessageSquare className="mr-2 h-4 w-4" />
                              Link Manually (Enter Telegram ID)
                            </Button>
                          </>
                        ) : (
                          <div className="space-y-4 p-3 border rounded-lg bg-muted/50">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium">Manual Telegram Linking</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setManualLinking(false);
                                  setManualTelegramId("");
                                  setManualVerificationCode("");
                                  setCodeSent(false);
                                  setQrCodeUrl(null);
                                }}
                                className="h-6 w-6 p-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Step 1: Instructions to start bot conversation */}
                            <div className="p-3 bg-background rounded-md border">
                              <Label className="text-xs font-semibold block mb-3">Step 1: Start Bot Conversation</Label>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Left column: Instructions */}
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-foreground">Option 1: Search for Bot</p>
                                    <p className="text-xs text-muted-foreground">
                                      {manualBotUsername ? (
                                        <>Search for <strong>@{manualBotUsername}</strong> on Telegram and click &quot;Start&quot;.</>
                                      ) : (
                                        <>Search for the bot on Telegram and click &quot;Start&quot;.</>
                                      )}
                                    </p>
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-foreground">Option 2: Scan QR Code</p>
                                    <p className="text-xs text-muted-foreground">
                                      Open Telegram → Click New chat → New contact → Add via QR code → Scan this QR code → Click Message → Press &quot;Start&quot; button
                                    </p>
                                  </div>
                                </div>
                                {/* Right column: QR Code */}
                                <div className="flex justify-center items-start">
                                  {qrCodeUrl ? (
                                    <img
                                      src={qrCodeUrl}
                                      alt="Telegram Bot QR Code"
                                      className="h-48 w-48 border-2 border-gray-300 rounded-lg object-contain bg-white p-2"
                                    />
                                  ) : (
                                    <div className="flex items-center justify-center h-48 w-48 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                                      <p className="text-xs text-muted-foreground text-center px-4">
                                        QR code not available
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Step 2: Enter Telegram username/ID */}
                            <div className="space-y-2">
                              <Label htmlFor="manualTelegramId" className="text-xs font-semibold">
                                Step 2: Enter @username or numeric ID
                              </Label>
                              <Input
                                id="manualTelegramId"
                                type="text"
                                placeholder="Enter @username or numeric ID"
                                value={manualTelegramId}
                                onChange={(e) => setManualTelegramId(e.target.value)}
                                disabled={codeSent || sendingCode || verifyingCode}
                                className="font-mono text-sm"
                              />
                              <p className="text-xs text-muted-foreground">
                                Enter your Telegram username (e.g., @username) or numeric ID. You can find your numeric ID by messaging @userinfobot on Telegram.
                              </p>
                            </div>

                            {/* Step 3: Send Verification Code */}
                            {!codeSent ? (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={handleSendManualCode}
                                disabled={!manualTelegramId || sendingCode}
                                className="w-full"
                              >
                                {sendingCode ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending Code...
                                  </>
                                ) : (
                                  <>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Send Verification Code
                                  </>
                                )}
                              </Button>
                            ) : (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="manualVerificationCode" className="text-xs">
                                    Verification Code
                                  </Label>
                                  <Input
                                    id="manualVerificationCode"
                                    type="text"
                                    placeholder="Enter the code you received"
                                    value={manualVerificationCode}
                                    onChange={(e) => setManualVerificationCode(e.target.value.toUpperCase())}
                                    disabled={verifyingCode}
                                    className="font-mono text-sm text-center text-lg tracking-widest"
                                    maxLength={8}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Check your Telegram messages for the verification code
                                  </p>
                                </div>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={handleVerifyManualCode}
                                  disabled={!manualVerificationCode || verifyingCode || manualVerificationCode.length !== 8}
                                  className="w-full"
                                >
                                  {verifyingCode ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Verifying...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="mr-2 h-4 w-4" />
                                      Verify & Link
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleSendManualCode}
                                  disabled={sendingCode}
                                  className="w-full"
                                >
                                  {sendingCode ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Resending...
                                    </>
                                  ) : (
                                    "Resend Code"
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* WhatsApp Notifications Section */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">WhatsApp Notifications</Label>
                    {whatsappEnabled === false ? (
                      <div className="p-3 border rounded-lg bg-muted/50">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">
                              WhatsApp Notifications Disabled
                            </p>
                            <p className="text-xs text-muted-foreground">
                              WhatsApp notifications are not configured. Contact an administrator to enable WhatsApp.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                          <div className="space-y-0.5">
                            <Label className="text-base">Opt-in to WhatsApp</Label>
                            <p className="text-xs text-muted-foreground pr-4">
                              Receive notifications on your primary phone number if WhatsApp is supported.
                            </p>
                            {whatsappPhone && (
                              <p className="text-xs text-green-600 mt-1 flex items-center font-medium">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Linked: {whatsappPhone}
                              </p>
                            )}
                            {whatsappOptInChecked && pendingWhatsappPhone && pendingWhatsappPhone !== whatsappPhone && (
                              <p className="text-xs text-amber-600 mt-1">
                                OTP verification pending for {pendingWhatsappPhone}
                              </p>
                            )}
                          </div>
                          {savingWhatsapp ? (
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-1" />
                          ) : (
                            <Switch
                              checked={whatsappOptInChecked}
                              onCheckedChange={async (checked) => {
                                const fullPhone = formData.phoneNumber.trim() ? `${phoneCountryCode}${formData.phoneNumber.trim()}` : null;

                                if (checked && (!fullPhone || !/^\+[1-9]\d{6,14}$/.test(fullPhone))) {
                                  setMessageDialog({
                                    open: true,
                                    type: "error",
                                    title: "Invalid Phone Number",
                                    message: "Please enter a valid primary phone number in the Basic Information section first.",
                                  });
                                  return;
                                }

                                if (checked) {
                                  const verifiedFullPhone = fullPhone as string;
                                  setWhatsappOptInChecked(true);
                                  setPendingWhatsappPhone(verifiedFullPhone);
                                  setWhatsappVerificationToken(null);
                                  setWhatsappOtp("");
                                  const sent = await sendWhatsappOtp(verifiedFullPhone, true);
                                  if (!sent) {
                                    setWhatsappOptInChecked(!!whatsappPhone);
                                    setPendingWhatsappPhone(null);
                                  }
                                  return;
                                }

                                setSavingWhatsapp(true);
                                try {
                                  const response = await fetch("/api/profile", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ whatsappPhone: null }),
                                  });

                                  if (response.ok) {
                                    setWhatsappOptInChecked(false);
                                    setWhatsappPhone("");
                                    setPendingWhatsappPhone(null);
                                    setWhatsappVerificationToken(null);
                                    setMessageDialog({
                                      open: true,
                                      type: "success",
                                      title: "WhatsApp Disabled",
                                      message: "WhatsApp notifications have been disabled.",
                                    });
                                  } else {
                                    const err = await response.json();
                                    setMessageDialog({
                                      open: true,
                                      type: "error",
                                      title: "Error",
                                      message: err.error || "Failed to update WhatsApp preferences",
                                    });
                                    setWhatsappOptInChecked(true);
                                  }
                                } catch (error) {
                                  console.error("Error updating WhatsApp:", error);
                                  setMessageDialog({
                                    open: true,
                                    type: "error",
                                    title: "Error",
                                    message: "An error occurred. Please try again.",
                                  });
                                  setWhatsappOptInChecked(true);
                                } finally {
                                  setSavingWhatsapp(false);
                                }
                              }}
                              disabled={saving}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Two-Factor Authentication Section - Show when Telegram or WhatsApp is linked */}
                  {(telegramId || whatsappPhone) && (
                    <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          <Label htmlFor="twoFactorEnabled" className="text-sm font-medium cursor-pointer">
                            Two-Factor Authentication
                          </Label>
                        </div>
                        <Switch
                          id="twoFactorEnabled"
                          checked={twoFactorEnabled}
                          disabled={toggling2FA}
                          onCheckedChange={async (checked) => {
                            setToggling2FA(true);
                            try {
                              const response = await fetch("/api/profile/two-factor", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ enabled: checked }),
                              });

                              if (response.ok) {
                                const data = await response.json();
                                setTwoFactorEnabled(data.twoFactorEnabled);
                                setMessageDialog({
                                  open: true,
                                  type: "success",
                                  title: checked ? "2FA Enabled" : "2FA Disabled",
                                  message: checked
                                    ? "Two-factor authentication is now enabled. You will receive a verification code when logging in."
                                    : "Two-factor authentication has been disabled.",
                                });
                              } else {
                                const error = await response.json();
                                setMessageDialog({
                                  open: true,
                                  type: "error",
                                  title: "Error",
                                  message: error.error || "Failed to update 2FA settings",
                                });
                              }
                            } catch (error) {
                              console.error("Error toggling 2FA:", error);
                              setMessageDialog({
                                open: true,
                                type: "error",
                                title: "Error",
                                message: "An error occurred. Please try again.",
                              });
                            } finally {
                              setToggling2FA(false);
                            }
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {twoFactorEnabled
                          ? `You will receive a verification code via ${preferredTwoFactorChannel === "WHATSAPP" ? "WhatsApp" : "Telegram"} each time you log in.`
                          : "Enable to require a verification code when logging in."}
                      </p>
                      {/* Preferred channel selector - only when both channels are linked and 2FA is enabled */}
                      {twoFactorEnabled && telegramId && whatsappPhone && (
                        <div className="flex items-center gap-3 mt-2">
                          <Label className="text-xs whitespace-nowrap">Preferred channel:</Label>
                          <select
                            value={preferredTwoFactorChannel}
                            onChange={async (e) => {
                              const newChannel = e.target.value;
                              try {
                                const response = await fetch("/api/profile", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ preferredTwoFactorChannel: newChannel }),
                                });
                                if (response.ok) {
                                  setPreferredTwoFactorChannel(newChannel);
                                  setMessageDialog({
                                    open: true,
                                    type: "success",
                                    title: "Updated",
                                    message: `2FA codes will now be sent via ${newChannel === "WHATSAPP" ? "WhatsApp" : "Telegram"}.`,
                                  });
                                }
                              } catch (error) {
                                console.error("Error updating 2FA channel:", error);
                              }
                            }}
                            className="text-xs border rounded px-2 py-1 bg-background"
                          >
                            <option value="TELEGRAM">Telegram</option>
                            <option value="WHATSAPP">WhatsApp</option>
                          </select>
                        </div>
                      )}
                      {toggling2FA && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Updating...</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number</Label>
                    <div className="flex gap-2">
                      <select
                        className="flex h-9 w-[110px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={KNOWN_CODES.includes(phoneCountryCode) ? phoneCountryCode : "custom"}
                        onChange={(e) => {
                          if (e.target.value === "custom") {
                            setPhoneCountryCode("+");
                          } else {
                            setPhoneCountryCode(e.target.value);
                          }
                        }}
                        disabled={saving}
                      >
                        {KNOWN_COUNTRY_CODES.map((code) => (
                          <option key={code.value} value={code.value}>{code.label}</option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>
                      {(!KNOWN_CODES.includes(phoneCountryCode) || phoneCountryCode === "custom") && (
                        <Input
                          type="text"
                          placeholder="+123"
                          value={phoneCountryCode}
                          onChange={(e) => setPhoneCountryCode(e.target.value)}
                          disabled={saving}
                          className="w-[80px] font-mono text-sm"
                        />
                      )}
                      <Input
                        id="phoneNumber"
                        type="tel"
                        value={formData.phoneNumber}
                        onChange={(e) =>
                          setFormData({ ...formData, phoneNumber: e.target.value })
                        }
                        disabled={saving}
                        placeholder="Enter phone number"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email ID</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      disabled={saving}
                      placeholder="Enter email address"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="medicalCouncilNumber">Medical Council Registration Number</Label>
                    <Input
                      id="medicalCouncilNumber"
                      value={formData.medicalCouncilNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, medicalCouncilNumber: e.target.value })
                      }
                      disabled={saving}
                      placeholder="Enter registration number"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="degrees">Degree/s</Label>
                    <Input
                      id="degrees"
                      value={formData.degrees}
                      onChange={(e) =>
                        setFormData({ ...formData, degrees: e.target.value })
                      }
                      disabled={saving}
                      placeholder="e.g., MBBS, MD, DM"
                    />
                  </div>
                </div>
              </div>

              {/* Digital Signature Section */}
              {(signatureUrl || (session?.user?.role === Role.Consultant || session?.user?.role === Role.Coordinator)) && (
                <div className="space-y-4 border-t pt-6">
                  <div>
                    <Label className="text-sm font-medium">Digital Signature</Label>
                    {signatureUrl ? (
                      <div className="mt-2 space-y-3">
                        <div className="flex items-center gap-2">
                          {signatureImageUrl && (
                            <div className="border rounded p-2 bg-gray-50">
                              <img
                                src={signatureImageUrl}
                                alt="Your signature"
                                className="h-16 object-contain"
                                onError={() => setSignatureImageUrl(null)}
                              />
                            </div>
                          )}
                          <div className="flex-1">
                            {signatureAuthenticated ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="text-sm font-medium">Signature Authenticated</span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-amber-600">
                                  <AlertCircle className="h-5 w-5" />
                                  <span className="text-sm font-medium">Signature Pending Authentication</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Please review and authenticate your signature to use it in PDF reports.
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleAuthenticateSignature}
                                  disabled={authenticating}
                                >
                                  {authenticating ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Authenticating...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="mr-2 h-4 w-4" />
                                      Authenticate Signature
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">
                          No signature uploaded. Please contact an administrator to upload your signature.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}


              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={async () => {
                    // Reset form
                    if (session?.user?.id) {
                      try {
                        const response = await fetch(`/api/profile`);
                        if (response.ok) {
                          const userData = await response.json();
                          setFormData({
                            name: userData.name || "",
                            loginId: userData.loginId || "",
                            password: "",
                            confirmPassword: "",
                            phoneNumber: userData.phoneNumber || "",
                            email: userData.email || "",
                            medicalCouncilNumber: userData.medicalCouncilNumber || "",
                            degrees: userData.degrees || "",
                          });
                          setDepartmentName(userData.department?.name || null);
                          setTelegramId(userData.telegramId || null);
                          setWhatsappPhone(userData.whatsappPhone || "");
                          setWhatsappOptInChecked(!!userData.whatsappPhone);
                          setPendingWhatsappPhone(null);
                          setWhatsappVerificationToken(null);
                          setWhatsappOtp("");
                          setErrors({});
                        }
                      } catch (error) {
                        console.error("Error resetting form:", error);
                      }
                    }
                  }}
                  disabled={saving}
                  className="flex-1"
                >
                  <X className="mr-2 h-4 w-4" />
                  Reset
                </Button>
                <Button
                  onClick={() => handleSave()}
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
        </CardContent>
      </Card>

      <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Telegram Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlink your Telegram account? You will no longer receive notifications via Telegram.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlinkTelegram}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={unlinkingTelegram}
            >
              {unlinkingTelegram ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unlinking...
                </>
              ) : (
                "Unlink"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={oldPasswordDialogOpen}
        onOpenChange={() => {
          // Prevent closing the dialog - no close button or outside click
          // Only allow closing after successful password change or logout
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(e) => {
            // Prevent closing with ESC key
            e.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Verify Current Password</AlertDialogTitle>
            <AlertDialogDescription>
              Please enter your current password to confirm the password change. This helps protect your account from unauthorized changes.
              {passwordAttempts > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  {passwordAttempts} failed attempt{passwordAttempts !== 1 ? 's' : ''}. {3 - passwordAttempts} attempt{3 - passwordAttempts !== 1 ? 's' : ''} remaining.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="oldPassword">Current Password</Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={verifyingOldPassword || saving}
                placeholder="Enter your current password"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && oldPassword.trim() && !verifyingOldPassword && !saving) {
                    handleOldPasswordSubmit();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={handleOldPasswordSubmit}
              disabled={verifyingOldPassword || saving || !oldPassword.trim()}
              className="w-full"
            >
              {verifyingOldPassword || saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Save"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={whatsappOtpDialogOpen} onOpenChange={setWhatsappOtpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify WhatsApp Opt-in</DialogTitle>
            <DialogDescription>
              Enter the 6-digit OTP sent to {pendingWhatsappPhone || "your WhatsApp number"}.
              Verification is required before saving WhatsApp opt-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="whatsappOtp">OTP</Label>
            <Input
              id="whatsappOtp"
              value={whatsappOtp}
              onChange={(e) => setWhatsappOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              maxLength={6}
              disabled={verifyingWhatsappOtp || sendingWhatsappOtp}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={async () => {
                if (!pendingWhatsappPhone) return;
                await sendWhatsappOtp(pendingWhatsappPhone, false);
              }}
              disabled={sendingWhatsappOtp || verifyingWhatsappOtp || !pendingWhatsappPhone}
            >
              {sendingWhatsappOtp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resending...
                </>
              ) : (
                "Resend OTP"
              )}
            </Button>
            <Button
              onClick={handleVerifyWhatsappOtp}
              disabled={verifyingWhatsappOtp || sendingWhatsappOtp || whatsappOtp.trim().length !== 6}
            >
              {verifyingWhatsappOtp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify OTP"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MessageDialog
        open={messageDialog.open}
        onOpenChange={(open) => setMessageDialog((prev) => ({ ...prev, open }))}
        type={messageDialog.type}
        title={messageDialog.title}
        message={messageDialog.message}
      />
    </>
  );
}
