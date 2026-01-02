"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar, Users, Edit, Trash2, CheckCircle2, XCircle, UserCheck } from "lucide-react";
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
    <Card className={isPast || isCancelled ? "opacity-75" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {format(meetingDate, "MMM dd, yyyy 'at' HH:mm")}
            </CardTitle>
            {meeting.description && (
              <p className="text-sm text-muted-foreground">
                {meeting.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCompleted && (
              <Badge variant="default" className="bg-green-600">
                Completed
              </Badge>
            )}
            {isCancelled && (
              <Badge variant="destructive">Cancelled</Badge>
            )}
            {!isCompleted && !isCancelled && isPast && (
              <Badge variant="secondary">Past</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{meeting._count.cases} case(s)</span>
            </div>
            <div className="flex-shrink-0">
              Created by {meeting.createdBy.name}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" asChild className="flex-shrink-0">
              <Link href={`/register?meetingId=${meeting.id}`}>
                View Cases
              </Link>
            </Button>
            {onViewAttendees && isCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewAttendees(meeting.id)}
                className="flex-shrink-0"
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
                    className="flex-shrink-0"
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
                    className="flex-shrink-0"
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
                    className="flex-shrink-0"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(meeting.id)}
                    className="flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
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

