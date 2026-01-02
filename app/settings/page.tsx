import { Suspense } from "react";
import { SettingsPageClient } from "./SettingsPageClient";
import { Loader2 } from "lucide-react";

function SettingsPageContent() {
  return <SettingsPageClient />;
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}

