"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar, Users, Edit, UserCheck, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

interface MeetingListItemProps {
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
  onComplete?: (meetingId: string) => void;
  onCancel?: (meetingId: string) => void;
  onViewAttendees?: (meetingId: string) => void;
  canEdit?: boolean;
}

export function MeetingListItem({
  meeting,
  onEdit,
  onComplete,
  onCancel,
  onViewAttendees,
  canEdit = false,
}: MeetingListItemProps) {
  const meetingDate = new Date(meeting.date);
  const status = meeting.status || "SCHEDULED";
  const isCompleted = status === "COMPLETED";
  const isCancelled = status === "CANCELLED";

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-3.5 md:p-4 border rounded-lg bg-white shadow-sm hover:bg-neutral-50 transition-colors gap-3 md:gap-4">

      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 flex-1 min-w-0">
        <div className="flex items-center justify-between md:justify-start gap-2 flex-wrap">
          {/* Date & Time */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Calendar className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
            <div className="text-sm font-semibold md:font-medium whitespace-nowrap">
              {format(meetingDate, "MMM dd, yyyy")}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
              {format(meetingDate, "HH:mm")}
            </div>
          </div>

          {/* Status Tags */}
          <div className="flex items-center gap-1.5 flex-shrink-0 md:hidden">
            {isCompleted && (
              <Badge variant="default" className="bg-green-600 text-xs px-2 py-0.5">
                Completed
              </Badge>
            )}
            {isCancelled && (
              <Badge variant="destructive" className="text-xs px-2 py-0.5">Cancelled</Badge>
            )}
            {!isCompleted && !isCancelled && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">Past</Badge>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          {meeting.description ? (
            <p className="text-xs md:text-sm font-medium line-clamp-2 md:truncate">{meeting.description}</p>
          ) : (
            <p className="text-xs md:text-sm text-muted-foreground italic">No description</p>
          )}
        </div>

        {/* Info */}
        <div className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span>{meeting._count.cases} case(s)</span>
          </div>
          <div>
            Created by {meeting.createdBy.name}
          </div>
        </div>

        {/* Desktop Status Tags */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          {isCompleted && (
            <Badge variant="default" className="bg-green-600">
              Completed
            </Badge>
          )}
          {isCancelled && (
            <Badge variant="destructive">Cancelled</Badge>
          )}
          {!isCompleted && !isCancelled && (
            <Badge variant="secondary">Past</Badge>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap pt-2 md:pt-0 border-t md:border-t-0 border-neutral-100 flex-shrink-0">
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
          </>
        )}
      </div>
    </div>
  );
}

