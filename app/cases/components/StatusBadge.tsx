import { Badge } from "@/components/ui/badge";
import { CaseStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: CaseStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getVariant = (status: CaseStatus) => {
    switch (status) {
      case CaseStatus.DRAFT:
        return "outline";
      case CaseStatus.SUBMITTED:
        return "default";
      case CaseStatus.PENDING:
        return "secondary";
      case CaseStatus.REVIEWED:
        return "default";
      case CaseStatus.RESUBMITTED:
        return "secondary";
      case CaseStatus.ARCHIVED:
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <Badge variant={getVariant(status)} className={cn(className)}>
      {status}
    </Badge>
  );
}

