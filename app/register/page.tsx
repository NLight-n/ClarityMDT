"use client";

import { useState, useEffect, Suspense } from "react";
import { RegisterView } from "./components/RegisterView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { CaseStatus, Gender } from "@prisma/client";

interface Meeting {
  id: string;
  date: string;
  description: string | null;
  cases: Array<{
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
  }>;
}

interface NavigationMeetings {
  previous: {
    id: string;
    date: string;
  } | null;
  next: {
    id: string;
    date: string;
  } | null;
}

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [navigation, setNavigation] = useState<NavigationMeetings | null>(null);
  const [loading, setLoading] = useState(true);

  // Get meetingId from URL params, or use null for next upcoming
  const meetingId = searchParams.get("meetingId");

  useEffect(() => {
    loadMeeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const loadMeeting = async () => {
    setLoading(true);
    try {
      // Load the meeting with cases
      const meetingUrl = meetingId
        ? `/api/register/next-meeting?meetingId=${meetingId}`
        : "/api/register/next-meeting";
      const meetingResponse = await fetch(meetingUrl);
      
      if (meetingResponse.ok) {
        const meetingData = await meetingResponse.json();
        setCurrentMeeting(meetingData);

        // Load navigation (previous/next meetings)
        if (meetingData.id) {
          const navResponse = await fetch(
            `/api/register/meetings-navigation?meetingId=${meetingData.id}`
          );
          if (navResponse.ok) {
            const navData = await navResponse.json();
            setNavigation(navData);
          }
        }
      } else if (meetingResponse.status === 404) {
        setCurrentMeeting(null);
        setNavigation(null);
      }
    } catch (error) {
      console.error("Error loading meeting:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousMeeting = () => {
    if (navigation?.previous) {
      router.push(`/register?meetingId=${navigation.previous.id}`);
    }
  };

  const handleNextMeeting = () => {
    if (navigation?.next) {
      router.push(`/register?meetingId=${navigation.next.id}`);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!currentMeeting) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center p-12 border rounded-lg">
          <p className="text-muted-foreground">
            No upcoming meetings found.
          </p>
        </div>
      </div>
    );
  }

  const meetingDate = new Date(currentMeeting.date);

  return (
    <div className="container mx-auto p-3 md:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-2 md:mb-4">MDT Register</h1>
        
        {/* Mobile Navigation - Compact Layout */}
        <div className="md:hidden">
          {/* Current Meeting Header with Navigation - Single Row */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePreviousMeeting}
              disabled={!navigation?.previous}
              className="h-8 w-8 flex-shrink-0"
              title={navigation?.previous ? `Previous: ${format(new Date(navigation.previous.date), "MMM dd, yyyy")}` : undefined}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex-1 text-center min-w-0">
              <div className="flex items-center justify-center gap-1.5">
                <p className="text-sm font-semibold truncate">
                  {format(meetingDate, "MMM dd, yyyy")}
                </p>
                <Badge className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                  {currentMeeting.cases.length}
                </Badge>
              </div>
              {currentMeeting.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {currentMeeting.description}
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextMeeting}
              disabled={!navigation?.next}
              className="h-8 w-8 flex-shrink-0"
              title={navigation?.next ? `Next: ${format(new Date(navigation.next.date), "MMM dd, yyyy")}` : undefined}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Desktop Navigation - Original Layout */}
        <div className="hidden md:flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePreviousMeeting}
            disabled={!navigation?.previous}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            {navigation?.previous ? (
              <span>Previous: {format(new Date(navigation.previous.date), "MMM dd, yyyy")}</span>
            ) : (
              <span>Previous</span>
            )}
          </Button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <p className="text-lg font-semibold">
                {format(meetingDate, "MMMM dd, yyyy")}
              </p>
              <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs font-semibold">
                {currentMeeting.cases.length}
              </Badge>
            </div>
            {currentMeeting.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {currentMeeting.description}
              </p>
            )}
          </div>

          <Button
            variant="outline"
            onClick={handleNextMeeting}
            disabled={!navigation?.next}
            className="flex items-center gap-2"
          >
            {navigation?.next ? (
              <span>Next: {format(new Date(navigation.next.date), "MMM dd, yyyy")}</span>
            ) : (
              <span>Next</span>
            )}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Register View - 2-page layout with cases */}
      <RegisterView cases={currentMeeting.cases} currentMeetingId={currentMeeting.id} />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
