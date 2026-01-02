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
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Date */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium whitespace-nowrap">
            {format(meetingDate, "MMM dd, yyyy")}
          </div>
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {format(meetingDate, "HH:mm")}
          </div>
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          {meeting.description ? (
            <p className="text-sm font-medium truncate">{meeting.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No description</p>
          )}
        </div>

        {/* Info */}
        <div className="flex items-center gap-4 flex-shrink-0 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{meeting._count.cases} case(s)</span>
          </div>
          <div className="hidden sm:block">
            Created by {meeting.createdBy.name}
          </div>
        </div>

        {/* Status Tags */}
        <div className="flex items-center gap-2 flex-shrink-0">
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
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/register?meetingId=${meeting.id}`}>
            View Cases
          </Link>
        </Button>
        {onViewAttendees && isCompleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewAttendees(meeting.id)}
          >
            <UserCheck className="h-4 w-4 mr-1" />
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
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Complete
              </Button>
            )}
            {onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(meeting.id)}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(meeting.id)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

