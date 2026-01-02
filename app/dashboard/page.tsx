"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, FileText, AlertCircle, Users, Clock } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { CaseStatus } from "@prisma/client";
import { StatusBadge } from "@/app/cases/components/StatusBadge";

interface Meeting {
  id: string;
  date: string;
  description: string | null;
  _count: {
    cases: number;
  };
}

interface Case {
  id: string;
  patientName: string;
  mrn: string | null;
  status: CaseStatus;
  presentingDepartment: {
    name: string;
  };
  createdAt: string;
  submittedAt: string | null;
}

interface Statistics {
  totalCases: number;
  pendingCases: number;
  upcomingMeetings: number;
  totalUsers: number;
}

export default function DashboardPage() {
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [recentCases, setRecentCases] = useState<Case[]>([]);
  const [pendingCases, setPendingCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load statistics, meetings, and cases in parallel
      const [meetingsRes, casesRes, statsRes] = await Promise.all([
        fetch("/api/meetings"),
        fetch("/api/cases"),
        fetch("/api/dashboard/stats"),
      ]);

      if (meetingsRes.ok) {
        const meetings = await meetingsRes.json();
        const now = new Date();
        const upcoming = meetings
          .filter((m: Meeting) => new Date(m.date) >= now)
          .sort((a: Meeting, b: Meeting) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          )
          .slice(0, 5);
        setUpcomingMeetings(upcoming);
      }

      if (casesRes.ok) {
        const cases = await casesRes.json();
        // Recent cases (last 10, excluding archived)
        const recent = cases
          .filter((c: Case) => c.status !== CaseStatus.ARCHIVED)
          .sort((a: Case, b: Case) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, 10);
        setRecentCases(recent);

        // Pending cases
        const pending = cases
          .filter((c: Case) => c.status === CaseStatus.PENDING)
          .sort((a: Case, b: Case) => 
            (new Date(a.submittedAt || a.createdAt).getTime()) - 
            (new Date(b.submittedAt || b.createdAt).getTime())
          )
          .slice(0, 10);
        setPendingCases(pending);
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        setStatistics(stats);
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your MDT activities</p>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalCases}</div>
              <p className="text-xs text-muted-foreground">All cases in system</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.pendingCases}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming Meetings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.upcomingMeetings}</div>
              <p className="text-xs text-muted-foreground">Scheduled meetings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalUsers}</div>
              <p className="text-xs text-muted-foreground">Registered users</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Upcoming Meetings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Meetings
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/meetings">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingMeetings.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No upcoming meetings
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingMeetings.map((meeting) => {
                  const meetingDate = new Date(meeting.date);
                  return (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {format(meetingDate, "MMM dd, yyyy 'at' HH:mm")}
                        </div>
                        {meeting.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {meeting.description}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {meeting._count.cases} case(s)
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/register/meeting/${meeting.id}`}>View</Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Reviews */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Reviews
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/cases?status=PENDING">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pendingCases.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No pending reviews
              </p>
            ) : (
              <div className="space-y-3">
                {pendingCases.map((caseItem) => (
                  <div
                    key={caseItem.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{caseItem.patientName}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={caseItem.status} />
                        <span className="text-xs text-muted-foreground">
                          {caseItem.presentingDepartment.name}
                        </span>
                      </div>
                      {caseItem.submittedAt && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Submitted {format(new Date(caseItem.submittedAt), "MMM dd, yyyy")}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/cases/${caseItem.id}`}>View</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Cases */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Cases
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/cases">View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentCases.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No recent cases</p>
          ) : (
            <div className="space-y-3">
              {recentCases.map((caseItem) => (
                <div
                  key={caseItem.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex-1">
                    <div className="font-medium">{caseItem.patientName}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={caseItem.status} />
                      <span className="text-xs text-muted-foreground">
                        {caseItem.presentingDepartment.name}
                      </span>
                      {caseItem.mrn && (
                        <span className="text-xs text-muted-foreground">
                          MRN: {caseItem.mrn}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Created {format(new Date(caseItem.createdAt), "MMM dd, yyyy")}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/cases/${caseItem.id}`}>View</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
