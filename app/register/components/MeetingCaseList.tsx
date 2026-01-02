"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/app/cases/components/StatusBadge";
import { CaseStatus } from "@prisma/client";
import { format } from "date-fns";

interface Case {
  id: string;
  patientName: string;
  mrn: string | null;
  age: number;
  status: CaseStatus;
  presentingDepartment: {
    id: string;
    name: string;
  };
  createdAt: string;
}

interface MeetingCaseListProps {
  meetingId: string;
}

export function MeetingCaseList({ meetingId }: MeetingCaseListProps) {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const loadCases = async () => {
    try {
      const response = await fetch(`/api/cases?meetingId=${meetingId}`);
      if (response.ok) {
        const data = await response.json();
        setCases(data);
      }
    } catch (error) {
      console.error("Error loading cases:", error);
    } finally {
      setLoading(false);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cases Assigned to This Meeting</CardTitle>
      </CardHeader>
      <CardContent>
        {cases.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No cases assigned to this meeting yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient Name</TableHead>
                <TableHead>MRN</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((caseItem) => (
                <TableRow key={caseItem.id}>
                  <TableCell className="font-medium">
                    {caseItem.patientName}
                  </TableCell>
                  <TableCell>{caseItem.mrn || "-"}</TableCell>
                  <TableCell>{caseItem.age}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {caseItem.presentingDepartment.name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={caseItem.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(caseItem.createdAt), "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/cases/${caseItem.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

