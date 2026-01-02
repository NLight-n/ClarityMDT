"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

interface CaseHistoryProps {
  caseData: {
    createdAt: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    archivedAt: string | null;
    updatedAt: string;
  };
}

export function CaseHistory({ caseData }: CaseHistoryProps) {
  const historyItems = [
    {
      label: "Created",
      date: caseData.createdAt,
    },
    caseData.submittedAt && {
      label: "Submitted",
      date: caseData.submittedAt,
    },
    caseData.reviewedAt && {
      label: "Reviewed",
      date: caseData.reviewedAt,
    },
    caseData.archivedAt && {
      label: "Archived",
      date: caseData.archivedAt,
    },
  ].filter(Boolean) as Array<{
    label: string;
    date: string;
  }>;

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pt-3 pb-2">
        <CardTitle className="text-base">Timeline</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {historyItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-muted-foreground">{item.label}:</span>
              <span>{format(new Date(item.date), "MMM dd, yyyy HH:mm")}</span>
              {index < historyItems.length - 1 && (
                <span className="text-muted-foreground">•</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

