"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CasesTable } from "./components/CasesTable";
import { Filters } from "./components/Filters";
import { Plus, Loader2 } from "lucide-react";
import { CaseStatus } from "@prisma/client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { isConsultant, isCoordinator } from "@/lib/permissions/client";

interface Department {
  id: string;
  name: string;
}

interface Meeting {
  id: string;
  date: string;
  description: string | null;
}

export default function CasesPage() {
  const { data: session } = useSession();
  const [cases, setCases] = useState<any[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{
    status: CaseStatus | "ALL" | null;
    departmentId: string | null;
    meetingId: string | null;
    search: string | null;
  }>({
    status: null,
    departmentId: null,
    meetingId: null,
    search: null,
  });

  useEffect(() => {
    loadDepartments();
    loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadCases();
    }, filters.search && filters.search.trim() ? 300 : 0); // 300ms debounce for search

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadCases = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.status) params.append("status", filters.status);
      if (filters.departmentId) params.append("departmentId", filters.departmentId);
      if (filters.meetingId) params.append("meetingId", filters.meetingId);
      if (filters.search && filters.search.trim()) params.append("search", filters.search.trim());

      const response = await fetch(`/api/cases?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setCases(data);
      }
    } catch (error) {
      console.error("Error loading cases:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await fetch("/api/departments");
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);
      }
    } catch (error) {
      console.error("Error loading departments:", error);
    }
  };

  const loadMeetings = async () => {
    try {
      const response = await fetch("/api/meetings");
      if (response.ok) {
        const data = await response.json();
        setMeetings(data);
      }
    } catch (error) {
      console.error("Error loading meetings:", error);
    }
  };

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const canCreateCase = user && (isConsultant(user) || isCoordinator(user));

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cases</h1>
          <p className="text-muted-foreground">View and manage cases</p>
        </div>
        {canCreateCase && (
          <Button asChild>
            <Link href="/cases/new">
              <Plus className="mr-2 h-4 w-4" />
              New Case
            </Link>
          </Button>
        )}
      </div>

      <Filters
        status={filters.status}
        departmentId={filters.departmentId}
        meetingId={filters.meetingId}
        search={filters.search}
        departments={departments}
        meetings={meetings}
        onStatusChange={(status) => setFilters({ ...filters, status })}
        onDepartmentChange={(departmentId) =>
          setFilters({ ...filters, departmentId })
        }
        onMeetingChange={(meetingId) => setFilters({ ...filters, meetingId })}
        onSearchChange={(search) => setFilters({ ...filters, search })}
        onClear={() =>
          setFilters({ status: null, departmentId: null, meetingId: null, search: null })
        }
      />

      <CasesTable cases={cases} onRefresh={loadCases} />
    </div>
  );
}
