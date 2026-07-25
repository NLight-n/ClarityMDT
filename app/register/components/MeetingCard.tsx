"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar, Users, Edit, Trash2, CheckCircle2, XCircle, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";


interface MeetingCardProps {
  meeting: {
    id: string;
    date: string;
    description: string | null;
    status?: string;
    createdBy: {
      id: string;
      name: string;
    };
    _count: {
      cases: number;
    };
  };
  onEdit?: (meetingId: string) => void;
  onDelete?: (meetingId: string) => void;
  onComplete?: (meetingId: string) => void;
  onCancel?: (meetingId: string) => void;
  onViewAttendees?: (meetingId: string) => void;
  canEdit?: boolean;
  isPast?: boolean;
}

export function MeetingCard({
  meeting,
  onEdit,
  onDelete,
  onComplete,
  onCancel,
  onViewAttendees,
  canEdit = false,
  isPast: propIsPast,
}: MeetingCardProps) {
  const meetingDate = new Date(meeting.date);
  const isPast = propIsPast !== undefined ? propIsPast : meetingDate < new Date();
  const status = meeting.status || "SCHEDULED";
  const isCompleted = status === "COMPLETED";
  const isCancelled = status === "CANCELLED";

  return (
    <Card className={cn("bg-white shadow-sm", (isPast || isCancelled) ? "opacity-75" : "")}>

      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 min-w-0">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="truncate">{format(meetingDate, "MMM dd, yyyy 'at' HH:mm")}</span>
            </CardTitle>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isCompleted && (
                <Badge variant="default" className="bg-green-600 text-xs">
                  Completed
                </Badge>
              )}
              {isCancelled && (
                <Badge variant="destructive" className="text-xs">Cancelled</Badge>
              )}
              {!isCompleted && !isCancelled && isPast && (
                <Badge variant="secondary" className="text-xs">Past</Badge>
              )}
            </div>
          </div>
          {meeting.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {meeting.description}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{meeting._count.cases} case(s)</span>
            </div>
            <div className="truncate">
              Created by {meeting.createdBy.name}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" asChild className="h-8 text-xs sm:text-sm">
              <Link href={`/register?meetingId=${meeting.id}`}>
                View Cases
              </Link>
            </Button>
            {onViewAttendees && isCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewAttendees(meeting.id)}
                className="h-8 text-xs sm:text-sm"
              >
                <UserCheck className="h-3.5 w-3.5 mr-1" />
                Attendees
              </Button>
            )}
            {canEdit && !isCompleted && !isCancelled && (
              <>
                {onComplete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onComplete(meeting.id)}
                    className="h-8 text-xs sm:text-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Complete
                  </Button>
                )}
                {onCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCancel(meeting.id)}
                    className="h-8 text-xs sm:text-sm"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Cancel
                  </Button>
                )}
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(meeting.id)}
                    className="h-8 w-8"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(meeting.id)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

