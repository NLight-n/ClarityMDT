"use client";

import { useEffect, useState } from "react";

interface HospitalSettings {
  name: string | null;
  logoUrl: string | null;
}

export function HospitalBranding() {
  const [settings, setSettings] = useState<HospitalSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/hospital-settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error loading hospital settings:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-4">
        <div className="h-8 w-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  // Show placeholder if no settings
  if (!settings || (!settings.name && !settings.logoUrl)) {
    return (
      <div className="flex items-center gap-4">
        <div className="h-8 w-32 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
          Hospital Name/Logo
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {settings.logoUrl ? (
        <div className="relative h-10 w-auto max-w-[200px] flex items-center">
          <img
            src={settings.logoUrl}
            alt={settings.name || "Hospital Logo"}
            className="h-full w-auto object-contain"
            style={{ maxHeight: "40px" }}
          />
        </div>
      ) : null}
      {settings.name ? (
        <h2 className="text-lg font-semibold">{settings.name}</h2>
      ) : null}
    </div>
  );
}

