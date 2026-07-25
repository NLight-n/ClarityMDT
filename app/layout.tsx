import type { Metadata } from "next";
import type { Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { PWARegister } from "@/components/providers/PWARegister";

export const metadata: Metadata = {
  title: "ClarityMDT",
  description: "ClarityMDT - Multi-Disciplinary Team Register Digital System",
  icons: {
    icon: "/icon.svg?v=2",
    apple: "/icon.svg?v=2",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PWARegister />
        <SessionProvider>
          <AppLayout>{children}</AppLayout>
        </SessionProvider>
      </body>
    </html>
  );
}

