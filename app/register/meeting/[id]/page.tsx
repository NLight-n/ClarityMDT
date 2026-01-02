"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { MeetingCaseList } from "../../components/MeetingCaseList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, ArrowLeft, Users } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

interface Meeting {
  id: string;
  date: string;
  description: string | null;
  createdBy: {
    id: string;
    name: string;
  };
  _count: {
    cases: number;
  };
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (meetingId) {
      loadMeeting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const loadMeeting = async () => {
    try {
      const response = await fetch("/api/meetings");
      if (response.ok) {
        const meetings = await response.json();
        const foundMeeting = meetings.find((m: Meeting) => m.id === meetingId);
        if (foundMeeting) {
          setMeeting(foundMeeting);
        } else {
          router.push("/register");
        }
      } else {
        router.push("/register");
      }
    } catch (error) {
      console.error("Error loading meeting:", error);
      router.push("/register");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">Meeting not found</p>
      </div>
    );
  }

  const meetingDate = new Date(meeting.date);
  const isPast = meetingDate < new Date();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/register">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Register
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl flex items-center gap-2">
                <Calendar className="h-6 w-6" />
                {format(meetingDate, "MMMM dd, yyyy 'at' HH:mm")}
              </CardTitle>
              {meeting.description && (
                <p className="text-muted-foreground">{meeting.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{meeting._count.cases} case(s)</span>
                </div>
                <div>Created by {meeting.createdBy.name}</div>
              </div>
            </div>
            {isPast && (
              <Badge variant="secondary">Past Meeting</Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      <MeetingCaseList meetingId={meetingId} />
    </div>
  );
}

