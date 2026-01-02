"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/app/cases/components/StatusBadge";
import { CaseStatus, Gender } from "@prisma/client";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface RegisterCaseCardProps {
  caseData: {
    id: string;
    patientName: string;
    mrn: string | null;
    age: number;
    gender: Gender;
    presentingDepartment: {
      name: string;
    };
    clinicalDetails: any; // JSON field (ProseMirror format)
    diagnosisStage: string;
    status: CaseStatus;
    radiologyFindings: any;
    pathologyFindings: any;
    followUp: string | null;
    _count: {
      attachments: number;
      specialistsOpinions: number;
    };
  };
  className?: string;
  meetingId?: string;
}

export function RegisterCaseCard({ caseData, className, meetingId }: RegisterCaseCardProps) {
  // Extract text from clinicalDetails JSON (ProseMirror format)
  const extractTextFromJSON = (json: any): string => {
    if (!json) return "";
    try {
      const content = typeof json === 'string' ? JSON.parse(json) : json;
      if (!content || !content.content || !Array.isArray(content.content)) {
        return "";
      }
      
      // Recursively extract text from all nodes
      const extractText = (node: any): string => {
        if (node.type === 'text' && node.text) {
          return node.text;
        }
        if (node.content && Array.isArray(node.content)) {
          return node.content.map(extractText).join('');
        }
        return '';
      };
      
      return content.content.map(extractText).join(' ').trim();
    } catch {
      return "";
    }
  };

  const clinicalDetailsText = extractTextFromJSON(caseData.clinicalDetails);
  
  // Truncate clinical details to a short description (first 100 characters for compact display)
  const shortDescription = clinicalDetailsText.length > 100
    ? clinicalDetailsText.substring(0, 100) + "..."
    : clinicalDetailsText;

  // Build the URL with referrer and meetingId if available
  const caseUrl = meetingId 
    ? `/cases/${caseData.id}?from=register&meetingId=${meetingId}`
    : `/cases/${caseData.id}?from=register`;

  // Check if JSON fields have content (TipTap JSON structure)
  const hasRadiologyFindings = (() => {
    if (!caseData.radiologyFindings) return false;
    try {
      const json = typeof caseData.radiologyFindings === 'string' 
        ? JSON.parse(caseData.radiologyFindings) 
        : caseData.radiologyFindings;
      // TipTap JSON has structure: { type: "doc", content: [...] }
      if (json && json.content && Array.isArray(json.content) && json.content.length > 0) {
        // Check if there's meaningful content (not just empty paragraph)
        return json.content.some((node: any) => {
          if (node.type === 'paragraph') {
            // Paragraph with no content is empty
            if (!node.content || node.content.length === 0) return false;
            // Check if paragraph has text content
            return node.content.some((item: any) => 
              item.type === 'text' && item.text && item.text.trim().length > 0
            );
          }
          // Non-paragraph nodes (like images, headings) indicate content
          return true;
        });
      }
      return false;
    } catch {
      return false;
    }
  })();

  const hasPathologyFindings = (() => {
    if (!caseData.pathologyFindings) return false;
    try {
      const json = typeof caseData.pathologyFindings === 'string' 
        ? JSON.parse(caseData.pathologyFindings) 
        : caseData.pathologyFindings;
      // TipTap JSON has structure: { type: "doc", content: [...] }
      if (json && json.content && Array.isArray(json.content) && json.content.length > 0) {
        // Check if there's meaningful content (not just empty paragraph)
        return json.content.some((node: any) => {
          if (node.type === 'paragraph') {
            // Paragraph with no content is empty
            if (!node.content || node.content.length === 0) return false;
            // Check if paragraph has text content
            return node.content.some((item: any) => 
              item.type === 'text' && item.text && item.text.trim().length > 0
            );
          }
          // Non-paragraph nodes (like images, headings) indicate content
          return true;
        });
      }
      return false;
    } catch {
      return false;
    }
  })();

  const hasAttachments = caseData._count.attachments > 0;
  const hasSpecialistsOpinions = caseData._count.specialistsOpinions > 0;
  
  // Follow-up tag should only show for REVIEWED, RESUBMITTED, ARCHIVED status
  const shouldShowFollowUp = 
    caseData.status === CaseStatus.REVIEWED ||
    caseData.status === CaseStatus.RESUBMITTED ||
    caseData.status === CaseStatus.ARCHIVED;
  const hasFollowUp = shouldShowFollowUp && caseData.followUp && caseData.followUp.trim().length > 0;

  return (
    <Link href={caseUrl} className={cn("h-full flex", className)}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full w-full flex flex-col">
        <CardContent className="p-3 flex flex-col flex-1 min-h-0">
          <div className="space-y-2 flex flex-col flex-1 min-h-0">
            {/* Patient Details */}
            <div className="space-y-1 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-base leading-tight">{caseData.patientName}</h3>
                <StatusBadge status={caseData.status} className="text-xs flex-shrink-0" />
              </div>
              <div className="text-xs text-muted-foreground space-y-0">
                {caseData.mrn && (
                  <div>MRN: {caseData.mrn}</div>
                )}
                <div>
                  {caseData.age} years, {caseData.gender} | Dept: {caseData.presentingDepartment.name}
                </div>
              </div>
            </div>

            {/* Diagnosis Stage */}
            {caseData.diagnosisStage && (
              <div className="text-xs font-medium text-foreground flex-shrink-0">
                Diagnosis: {caseData.diagnosisStage}
              </div>
            )}

            {/* Tags - Status indicators */}
            <div className="flex flex-wrap gap-1 flex-shrink-0">
              <Badge 
                variant={hasRadiologyFindings ? "default" : "outline"}
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4",
                  hasRadiologyFindings ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border-muted-foreground/30"
                )}
              >
                Radiology
              </Badge>
              <Badge 
                variant={hasPathologyFindings ? "default" : "outline"}
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4",
                  hasPathologyFindings ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border-muted-foreground/30"
                )}
              >
                Pathology
              </Badge>
              <Badge 
                variant={hasAttachments ? "default" : "outline"}
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4",
                  hasAttachments ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border-muted-foreground/30"
                )}
              >
                Attachment
              </Badge>
              <Badge 
                variant={hasSpecialistsOpinions ? "default" : "outline"}
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4",
                  hasSpecialistsOpinions ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border-muted-foreground/30"
                )}
              >
                Specialists
              </Badge>
              {shouldShowFollowUp && (
                <Badge 
                  variant={hasFollowUp ? "default" : "outline"}
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4",
                    hasFollowUp ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border-muted-foreground/30"
                  )}
                >
                  Follow-up
                </Badge>
              )}
            </div>

            {/* Small Description - Takes remaining space */}
            <div className="text-xs text-foreground leading-relaxed flex-1 overflow-hidden">
              <div className="h-full overflow-hidden line-clamp-3">
                {shortDescription}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

