"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { CaseStatus, Gender } from "@prisma/client";
import { format } from "date-fns";

interface Case {
  id: string;
  patientName: string;
  mrn: string | null;
  age: number;
  gender: Gender;
  presentingDepartment: {
    id: string;
    name: string;
  };
  createdBy: {
    id: string;
    name: string;
  };
  assignedMeeting: {
    id: string;
    date: string;
    description: string | null;
  } | null;
  status: CaseStatus;
  createdAt: string;
  _count: {
    attachments: number;
    specialistsOpinions: number;
  };
}

interface CasesTableProps {
  cases: Case[];
  onRefresh?: () => void;
}

export function CasesTable({ cases }: CasesTableProps) {
  const router = useRouter();

  const handleRowClick = (caseId: string) => {
    router.push(`/cases/${caseId}`);
  };
  if (cases.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        No cases found
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient Name</TableHead>
            <TableHead>MRN</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Gender</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead>Meeting</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((caseItem) => (
            <TableRow 
              key={caseItem.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleRowClick(caseItem.id)}
            >
              <TableCell className="font-medium">
                {caseItem.patientName}
              </TableCell>
              <TableCell>{caseItem.mrn || "—"}</TableCell>
              <TableCell>{caseItem.age}</TableCell>
              <TableCell>{caseItem.gender}</TableCell>
              <TableCell>{caseItem.presentingDepartment.name}</TableCell>
              <TableCell>
                <StatusBadge status={caseItem.status} />
              </TableCell>
              <TableCell>{caseItem.createdBy.name}</TableCell>
              <TableCell>
                {caseItem.assignedMeeting
                  ? format(new Date(caseItem.assignedMeeting.date), "MMM dd, yyyy")
                  : "—"}
              </TableCell>
              <TableCell>
                {format(new Date(caseItem.createdAt), "MMM dd, yyyy")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

