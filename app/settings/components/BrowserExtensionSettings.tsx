"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Puzzle, ExternalLink } from "lucide-react";

export function BrowserExtensionSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-teal-700" />
            <CardTitle>InstaHMS Browser Extension (Firefox)</CardTitle>
          </div>
          <CardDescription>
            Bridge basic patient demographics (MRN, Name, Age, Gender) directly from InstaHMS into ClarityMDT.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href="/api/extensions/firefox">
                <ExternalLink className="mr-2 h-4 w-4" />
                Install Firefox Extension
              </a>
            </Button>

            <Button variant="outline" asChild>
              <a
                href="/downloads/clarity-hms-bridge.xpi"
                download="clarity-hms-bridge-0.1.0.xpi"
              >
                <Download className="mr-2 h-4 w-4" />
                Download .xpi File
              </a>
            </Button>
          </div>

          <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-2">
            <p className="font-medium">How to use after installing:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Open the Firefox Extensions (puzzle) icon in your toolbar and{" "}
                <span className="font-medium text-foreground">Pin to Toolbar</span>{" "}
                for quick access.
              </li>
              <li>
                Keep an InstaHMS tab signed in (<code className="text-xs">192.168.10.12</code>).
              </li>
              <li>
                <span className="font-medium text-foreground">Push from HMS:</span>{" "}
                On any InstaHMS patient chart, click the ClarityMDT toolbar icon to open a pre-filled New Case form.
              </li>
              <li>
                <span className="font-medium text-foreground">Pull into ClarityMDT:</span>{" "}
                Enter an MRN on the Create New Case page and click{" "}
                <span className="font-medium text-foreground">Fetch from HMS</span>.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground pt-1">
              Note: If Firefox prompts for site permissions on first use, allow access for{" "}
              <code>192.168.10.12</code> and <code>192.168.11.143</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-teal-700" />
            <CardTitle>InstaHMS Browser Extension (Chrome / Edge)</CardTitle>
          </div>
          <CardDescription>
            Manual installation package for Google Chrome and Microsoft Edge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" asChild>
              <a
                href="/downloads/clarity-hms-bridge-chrome.zip"
                download="clarity-hms-bridge-chrome.zip"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Chrome Extension (.zip)
              </a>
            </Button>
          </div>

          <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-2">
            <p className="font-medium">How to install manually in Chrome / Edge:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Download and extract{" "}
                <code className="text-xs">clarity-hms-bridge-chrome.zip</code> to a permanent folder on your PC (do not delete this folder after installing).
              </li>
              <li>
                Open{" "}
                <code className="text-xs">chrome://extensions</code> (or{" "}
                <code className="text-xs">edge://extensions</code>) in a new tab.
              </li>
              <li>
                Turn on <span className="font-medium text-foreground">Developer mode</span> (toggle in the top-right corner).
              </li>
              <li>
                Click <span className="font-medium text-foreground">Load unpacked</span> and select the extracted folder containing{" "}
                <code className="text-xs">manifest.json</code>.
              </li>
              <li>
                Click the Extensions (puzzle) icon in the toolbar and{" "}
                <span className="font-medium text-foreground">Pin</span> ClarityMDT - InstaHMS Bridge.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground pt-1">
              Keep an InstaHMS tab signed in (<code className="text-xs">192.168.10.12</code>) for both Push and{" "}
              <span className="font-medium text-foreground">Fetch from HMS</span>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
