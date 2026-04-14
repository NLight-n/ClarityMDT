import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "ClarityMDT",
  description: "ClarityMDT - Multi-Disciplinary Team Register Digital System",
  icons: {
    icon: "/icon.svg?v=2",
    apple: "/icon.svg?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <AppLayout>{children}</AppLayout>
        </SessionProvider>
      </body>
    </html>
  );
}

