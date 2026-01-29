"use client";

import { useState, useEffect, Suspense } from "react";
import { getCsrfToken } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Shield, Loader2 } from "lucide-react";

interface HospitalSettings {
  name: string | null;
  logoUrl: string | null;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [hospitalSettings, setHospitalSettings] = useState<HospitalSettings | null>(null);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null);
  const [sending2FACode, setSending2FACode] = useState(false);
  const [verifying2FA, setVerifying2FA] = useState(false);

  // Get CSRF token on mount and check for errors in URL
  useEffect(() => {
    // Fetch CSRF token to ensure it's available for the current origin
    getCsrfToken()
      .then((token) => {
        setCsrfToken(token);
      })
      .catch((err) => {
        console.error("Error fetching CSRF token:", err);
        // Don't set error here - we'll fetch fresh token on submit
      });

    const errorParam = searchParams.get("error");
    if (errorParam) {
      if (errorParam === "CredentialsSignin") {
        setError("Invalid login ID or password");
      } else if (errorParam === "MissingCSRF") {
        // For MissingCSRF, clear the error message after a moment
        // The user can try again and we'll fetch a fresh token
        setError("Security token expired. Please try again.");
        // Clear error after 3 seconds to allow retry
        setTimeout(() => setError(null), 3000);
      } else {
        setError("Login failed. Please try again.");
      }
    }
  }, [searchParams]);

  // Load hospital settings separately
  useEffect(() => {
    // Load hospital settings
    const loadHospitalSettings = async () => {
      try {
        const response = await fetch("/api/hospital-settings", {
          headers: {
            'Accept': 'application/json',
          },
        });

        // Check if response is OK and is JSON
        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            try {
              const data = await response.json();

              // Only proceed if we have valid data without errors
              if (data && !data.error) {
                // Check if we have valid name or logo
                const hasName = data.name && typeof data.name === 'string' && data.name.trim() !== "";
                const hasLogo = data.logoUrl && typeof data.logoUrl === 'string' && data.logoUrl.trim() !== "";

                // Set state if we have at least one valid field
                if (hasName || hasLogo) {
                  setHospitalSettings({
                    name: hasName ? data.name.trim() : null,
                    logoUrl: hasLogo ? data.logoUrl.trim() : null,
                  });
                }
              }
            } catch (jsonError) {
              // Failed to parse JSON
              console.warn("Failed to parse hospital settings JSON:", jsonError);
            }
          }
        }
      } catch (error) {
        // Silently fail - hospital branding is optional
        // Only log in development
        if (process.env.NODE_ENV === 'development') {
          console.error("Error loading hospital settings:", error);
        }
      }
    };
    loadHospitalSettings();
  }, []);

  // Check if 2FA is required and send code
  const handleCheck2FA = async () => {
    setError(null);
    setSending2FACode(true);

    try {
      const response = await fetch("/api/auth/two-factor/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ loginId, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
        setSending2FACode(false);
        return false;
      }

      if (data.requiresTwoFactor) {
        // 2FA is required
        setRequires2FA(true);
        if (data.expiresAt) {
          setCodeExpiresAt(new Date(data.expiresAt));
        }
        setSending2FACode(false);
        return true;
      } else {
        // 2FA not required, proceed with normal login
        setSending2FACode(false);
        return false;
      }
    } catch (err) {
      console.error("Error checking 2FA:", err);
      setError("An error occurred. Please try again.");
      setSending2FACode(false);
      return false;
    }
  };

  // Verify 2FA code and complete login
  const handle2FAVerify = async () => {
    if (!twoFactorCode || twoFactorCode.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setError(null);
    setVerifying2FA(true);

    try {
      const response = await fetch("/api/auth/two-factor/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ loginId, password, code: twoFactorCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Verification failed");
        setTwoFactorCode("");
        setVerifying2FA(false);
        return;
      }

      if (data.success && data.verified) {
        // 2FA verified, now complete the NextAuth login
        await completeLogin();
      }
    } catch (err) {
      console.error("Error verifying 2FA:", err);
      setError("Verification failed. Please try again.");
      setVerifying2FA(false);
    }
  };

  // Complete the login via NextAuth
  const completeLogin = async () => {
    try {
      // Always fetch a fresh CSRF token right before submission
      const freshCsrfToken = await getCsrfToken();

      if (!freshCsrfToken) {
        setError("Failed to get security token. Please refresh the page and try again.");
        setIsLoading(false);
        setVerifying2FA(false);
        return;
      }

      // Create and submit form directly to NextAuth endpoint
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/callback/credentials";

      // Add CSRF token
      const csrfInput = document.createElement("input");
      csrfInput.type = "hidden";
      csrfInput.name = "csrfToken";
      csrfInput.value = freshCsrfToken;
      form.appendChild(csrfInput);

      // Add credentials
      const loginIdInput = document.createElement("input");
      loginIdInput.type = "hidden";
      loginIdInput.name = "loginId";
      loginIdInput.value = loginId;
      form.appendChild(loginIdInput);

      const passwordInput = document.createElement("input");
      passwordInput.type = "hidden";
      passwordInput.name = "password";
      passwordInput.value = password;
      form.appendChild(passwordInput);

      // Add callback URL
      const callbackInput = document.createElement("input");
      callbackInput.type = "hidden";
      callbackInput.name = "callbackUrl";
      callbackInput.value = "/dashboard";
      form.appendChild(callbackInput);

      // Submit form
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error("Error completing login:", err);
      setError("An error occurred. Please try again.");
      setIsLoading(false);
      setVerifying2FA(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // First check if 2FA is required
      const check2FAResponse = await fetch("/api/auth/two-factor/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ loginId, password }),
      });

      const check2FAData = await check2FAResponse.json();

      if (!check2FAResponse.ok) {
        setError(check2FAData.error || "Login failed");
        setIsLoading(false);
        return;
      }

      if (check2FAData.requiresTwoFactor) {
        // 2FA is required - show 2FA form
        setRequires2FA(true);
        if (check2FAData.expiresAt) {
          setCodeExpiresAt(new Date(check2FAData.expiresAt));
        }
        setIsLoading(false);
        return;
      }

      // 2FA not required - proceed with normal login
      await completeLogin();
    } catch (err) {
      console.error("Error during login:", err);
      setError("An error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  // Resend 2FA code
  const handleResend2FA = async () => {
    setSending2FACode(true);
    setError(null);
    setTwoFactorCode("");

    try {
      const response = await fetch("/api/auth/two-factor/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ loginId, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to resend code");
      } else if (data.expiresAt) {
        setCodeExpiresAt(new Date(data.expiresAt));
      }
    } catch (err) {
      console.error("Error resending 2FA code:", err);
      setError("Failed to resend code. Please try again.");
    } finally {
      setSending2FACode(false);
    }
  };

  // Cancel 2FA and go back to login
  const handleCancel2FA = () => {
    setRequires2FA(false);
    setTwoFactorCode("");
    setError(null);
    setCodeExpiresAt(null);
  };

  // 2FA verification form
  if (requires2FA) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-2">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-center">Two-Factor Authentication</CardTitle>
            <CardDescription className="text-center">
              Enter the 6-digit code sent to your Telegram
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="twoFactorCode">Verification Code</Label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={verifying2FA}
                  autoComplete="one-time-code"
                  autoFocus
                  className="text-center text-2xl tracking-widest"
                />
              </div>

              {codeExpiresAt && (
                <p className="text-xs text-muted-foreground text-center">
                  Code expires at {codeExpiresAt.toLocaleTimeString()}
                </p>
              )}

              <Button
                className="w-full"
                onClick={handle2FAVerify}
                disabled={verifying2FA || twoFactorCode.length !== 6}
              >
                {verifying2FA ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Sign In"
                )}
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleResend2FA}
                  disabled={sending2FACode || verifying2FA}
                >
                  {sending2FACode ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Resend Code"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={handleCancel2FA}
                  disabled={verifying2FA}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hospital Branding Footer */}
        {hospitalSettings && (hospitalSettings.name || hospitalSettings.logoUrl) && (
          <div className="mt-8 flex flex-col items-center gap-3">
            {hospitalSettings.logoUrl && (() => {
              const logoUrl = hospitalSettings.logoUrl.startsWith("data:image/")
                ? hospitalSettings.logoUrl
                : `/api/images/stream/${hospitalSettings.logoUrl}`;

              return (
                <div className="relative h-10 w-auto max-w-[200px] flex items-center justify-center">
                  <img
                    src={logoUrl}
                    alt={hospitalSettings.name || "Hospital Logo"}
                    className="h-full w-auto object-contain"
                    style={{ maxHeight: "40px" }}
                  />
                </div>
              );
            })()}
            {hospitalSettings.name && (
              <h3 className="text-sm font-semibold text-muted-foreground text-center">
                {hospitalSettings.name}
              </h3>
            )}
          </div>
        )}
      </div>
    );
  }

  // Regular login form
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">ClarityMDT</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="loginId">Login ID</Label>
              <Input
                id="loginId"
                type="text"
                placeholder="Enter your login ID"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Hospital Branding Footer - Only show if settings are configured */}
      {hospitalSettings && (hospitalSettings.name || hospitalSettings.logoUrl) && (
        <div className="mt-8 flex flex-col items-center gap-3">
          {hospitalSettings.logoUrl && (() => {
            // Handle both base64 data URLs and MinIO storage keys
            const logoUrl = hospitalSettings.logoUrl.startsWith("data:image/")
              ? hospitalSettings.logoUrl
              : `/api/images/stream/${hospitalSettings.logoUrl}`;

            return (
              <div className="relative h-10 w-auto max-w-[200px] flex items-center justify-center">
                <img
                  src={logoUrl}
                  alt={hospitalSettings.name || "Hospital Logo"}
                  className="h-full w-auto object-contain"
                  style={{ maxHeight: "40px" }}
                />
              </div>
            );
          })()}
          {hospitalSettings.name && (
            <h3 className="text-sm font-semibold text-muted-foreground text-center">
              {hospitalSettings.name}
            </h3>
          )}
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">Loading...</div>
          </CardContent>
        </Card>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
