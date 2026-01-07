"use client";

import { useState, useEffect, Suspense } from "react";
import { getCsrfToken } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Always fetch a fresh CSRF token right before submission
      // This ensures the token is valid for the current origin (LAN IP or tunnel domain)
      const freshCsrfToken = await getCsrfToken();
      
      if (!freshCsrfToken) {
        setError("Failed to get security token. Please refresh the page and try again.");
        setIsLoading(false);
        return;
      }

      // Create and submit form directly to NextAuth endpoint
      // This bypasses all client-side URL construction issues
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/callback/credentials";
      
      // Add CSRF token (use fresh token)
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
      
      // Submit form - browser will handle redirect naturally
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error("Error preparing login form:", err);
      setError("An error occurred. Please try again.");
      setIsLoading(false);
    }
  };

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
              {isLoading ? "Signing in..." : "Sign in"}
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

